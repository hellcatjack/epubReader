import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useOutletContext } from "react-router-dom";
import { afterEach, beforeEach, vi } from "vitest";
import { ReaderAppShell } from "./ReaderAppShell";
import type { ReaderAppShellContext } from "./readerAppShellContext";

const deleteBookMock = vi.fn();
const importBookMock = vi.fn();
const listBookshelfItemsMock = vi.fn();
const bookshelfItems = [
  {
    id: "book-1",
    title: "First Book",
    author: "Author One",
    progressLabel: "12% read",
    lastReadAt: 100,
  },
  {
    id: "book-2",
    title: "Second Book",
    author: "Author Two",
    progressLabel: "42% read",
    lastReadAt: 200,
  },
];

vi.mock("../features/bookshelf/importBook", () => ({
  importBook: (file: File) => importBookMock(file),
}));

vi.mock("../features/bookshelf/bookshelfRepository", () => ({
  deleteBook: (bookId: string) => deleteBookMock(bookId),
  listBookshelfItems: () => listBookshelfItemsMock(),
}));

function ShellOutletStub() {
  return <p>Shell outlet content</p>;
}

function ReaderOutletStub() {
  const location = useLocation();
  const shell = useOutletContext<ReaderAppShellContext>();

  return (
    <div>
      <p>{`Reader route opened: ${location.pathname}`}</p>
      <div aria-label="Reader route shell actions">
        <button type="button" onClick={shell.onLibraryClick}>
          Library
        </button>
        <button type="button" onClick={shell.onImportClick}>
          {shell.isImporting ? "Importing EPUB..." : "Import EPUB"}
        </button>
        <button type="button" onClick={shell.onSettingsClick}>
          Settings
        </button>
      </div>
      {shell.currentBook ? <p>{`Current shell book: ${shell.currentBook.title}`}</p> : null}
    </div>
  );
}

beforeEach(() => {
  deleteBookMock.mockReset();
  importBookMock.mockReset();
  listBookshelfItemsMock.mockReset();
  listBookshelfItemsMock.mockResolvedValue(bookshelfItems);
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderShell(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<ReaderAppShell />}>
          <Route index element={<ShellOutletStub />} />
          <Route path="books/:bookId" element={<ReaderOutletStub />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

it("renders the shared shell navigation and outlet content", () => {
  renderShell("/");

  const navigation = screen.getByRole("navigation", { name: /reader app navigation/i });
  expect(navigation).toBeInTheDocument();
  expect(within(navigation).getByRole("button", { name: /library/i })).toBeInTheDocument();
  expect(within(navigation).getByRole("button", { name: /import epub/i })).toBeInTheDocument();
  expect(within(navigation).getByRole("button", { name: /settings/i })).toBeInTheDocument();
  expect(screen.getByText("Shell outlet content")).toBeInTheDocument();
});

it("does not render the shell navigation on the reader route", async () => {
  renderShell("/books/book-1");

  await screen.findByText("Reader route opened: /books/book-1");

  expect(screen.queryByRole("navigation", { name: /reader app navigation/i })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Reader route shell actions")).toBeInTheDocument();
});

it("opens the existing settings panel from the reader route", async () => {
  const user = userEvent.setup();

  renderShell("/books/book-1");

  await user.click(screen.getByRole("button", { name: /settings/i }));

  expect(await screen.findByLabelText(/reader settings panel/i)).toBeInTheDocument();
});

it("opens a library drawer from the reader route", async () => {
  const user = userEvent.setup();

  renderShell("/books/book-1");

  await user.click(screen.getByRole("button", { name: /library/i }));

  expect(await screen.findByRole("dialog", { name: /library drawer/i })).toBeInTheDocument();
});

it("uses the library panel in the drawer and closes it after opening another book", async () => {
  const user = userEvent.setup();

  renderShell("/books/book-1");

  await user.click(screen.getByRole("button", { name: /library/i }));

  const drawer = await screen.findByRole("dialog", { name: /library drawer/i });
  expect(within(drawer).getByRole("heading", { name: /local books/i })).toBeInTheDocument();
  await user.click(within(drawer).getByRole("button", { name: /open book second book/i }));

  expect(await screen.findByText("Reader route opened: /books/book-2")).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: /library drawer/i })).not.toBeInTheDocument();
});

it("refreshes the drawer after deleting a book and keeps the reader route stable", async () => {
  const user = userEvent.setup();

  listBookshelfItemsMock
    .mockResolvedValueOnce(bookshelfItems)
    .mockResolvedValueOnce(bookshelfItems)
    .mockResolvedValueOnce([bookshelfItems[0]]);

  renderShell("/books/book-1");

  await user.click(screen.getByRole("button", { name: /library/i }));

  const drawer = await screen.findByRole("dialog", { name: /library drawer/i });
  await user.click(within(drawer).getByRole("button", { name: /delete book second book/i }));

  await waitFor(() => {
    expect(deleteBookMock).toHaveBeenCalledWith("book-2");
  });
  await waitFor(() => {
    expect(within(drawer).queryByRole("button", { name: /open book second book/i })).not.toBeInTheDocument();
  });
  expect(screen.getByText("Reader route opened: /books/book-1")).toBeInTheDocument();
});

it("imports a file from the reader route and navigates to the imported book", async () => {
  const user = userEvent.setup();
  const file = new File(["epub"], "new-book.epub", { type: "application/epub+zip" });

  importBookMock.mockResolvedValue({
    id: "imported-book",
    title: "Imported Book",
    author: "Author",
  });

  renderShell("/books/book-1");

  await user.upload(screen.getByLabelText(/import epub/i), file);

  await waitFor(() => {
    expect(importBookMock).toHaveBeenCalledWith(file);
  });
  await waitFor(() => {
    expect(listBookshelfItemsMock).toHaveBeenCalledTimes(2);
  });
  expect(await screen.findByText("Reader route opened: /books/imported-book")).toBeInTheDocument();
});

it("shows library context on the home route and current book context on a reader route", async () => {
  renderShell("/");
  expect(screen.getByText("Your library")).toBeInTheDocument();

  renderShell("/books/book-2");

  expect(await screen.findByText("Current shell book: Second Book")).toBeInTheDocument();
});
