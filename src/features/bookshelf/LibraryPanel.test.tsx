import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import type { BookshelfListItem } from "../../lib/types/books";
import { LibraryPanel } from "./LibraryPanel";

const books: BookshelfListItem[] = [
  {
    id: "book-1",
    title: "Minimal Valid EPUB",
    author: "Author",
    progressLabel: "42% read",
    lastReadAt: 200,
  },
  {
    id: "book-2",
    title: "Second Book",
    author: "Writer",
    progressLabel: "Unread",
    lastReadAt: 100,
  },
];

it("renders the continue-reading card and local books list", () => {
  render(
    <MemoryRouter>
      <LibraryPanel books={books} onDeleteBook={vi.fn()} onOpenBook={vi.fn()} />
    </MemoryRouter>,
  );

  const continueReading = screen.getByRole("region", { name: /continue reading/i });
  expect(within(continueReading).getByRole("heading", { name: /continue reading/i })).toBeInTheDocument();
  expect(within(continueReading).getByText("Minimal Valid EPUB")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: /local books/i })).getByText("Second Book")).toBeInTheDocument();
});

it("calls onOpenBook from the continue-reading action", async () => {
  const user = userEvent.setup();
  const onOpenBook = vi.fn();

  render(
    <MemoryRouter>
      <LibraryPanel books={books} onDeleteBook={vi.fn()} onOpenBook={onOpenBook} />
    </MemoryRouter>,
  );

  await user.click(screen.getByRole("button", { name: /continue minimal valid epub/i }));

  expect(onOpenBook).toHaveBeenCalledWith("book-1");
});

it("calls onDeleteBook from a local book card", async () => {
  const user = userEvent.setup();
  const onDeleteBook = vi.fn();

  render(
    <MemoryRouter>
      <LibraryPanel books={books} onDeleteBook={onDeleteBook} onOpenBook={vi.fn()} />
    </MemoryRouter>,
  );

  await user.click(screen.getByRole("button", { name: /delete book second book/i }));

  expect(onDeleteBook).toHaveBeenCalledWith("book-2");
});

it("shows empty-state copy when there are no local books", () => {
  render(
    <MemoryRouter>
      <LibraryPanel books={[]} onDeleteBook={vi.fn()} onOpenBook={vi.fn()} />
    </MemoryRouter>,
  );

  expect(screen.getByText(/no local books yet/i)).toBeInTheDocument();
});
