import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, vi } from "vitest";
import { ReaderAppShell } from "./ReaderAppShell";

const importBookMock = vi.fn();
const listBookshelfItemsMock = vi.fn();

vi.mock("../features/bookshelf/importBook", () => ({
  importBook: (file: File) => importBookMock(file),
}));

vi.mock("../features/bookshelf/bookshelfRepository", () => ({
  listBookshelfItems: () => listBookshelfItemsMock(),
}));

function ShellOutletStub() {
  return <p>Shell outlet content</p>;
}

function ReaderOutletStub() {
  const location = useLocation();
  return <p>{`Reader route opened: ${location.pathname}`}</p>;
}

beforeEach(() => {
  importBookMock.mockReset();
  listBookshelfItemsMock.mockReset();
  listBookshelfItemsMock.mockResolvedValue([]);
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
