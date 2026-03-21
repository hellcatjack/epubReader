import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { resetDb } from "../../lib/db/appDb";
import { getBook, saveBook } from "./bookshelfRepository";
import { BookshelfPage } from "./BookshelfPage";

afterEach(async () => {
  await resetDb();
});

it("loads persisted books from the local bookshelf when no props are provided", async () => {
  await saveBook({
    id: "book-2",
    title: "Stored EPUB",
    author: "Persisted Author",
    importHash: "hash-2",
    coverThumbnailBlob: null,
  });

  render(
    <MemoryRouter>
      <BookshelfPage />
    </MemoryRouter>,
  );

  expect(await screen.findByText("Stored EPUB")).toBeInTheDocument();
  expect(screen.getByText("Persisted Author")).toBeInTheDocument();
});

it("deletes a persisted book from the local bookshelf", async () => {
  const user = userEvent.setup();

  await saveBook({
    id: "book-delete",
    title: "Delete Me",
    author: "Cleanup Author",
    importHash: "hash-delete",
    coverThumbnailBlob: null,
  });

  render(
    <MemoryRouter>
      <BookshelfPage />
    </MemoryRouter>,
  );

  expect(await screen.findByText("Delete Me")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /delete book delete me/i }));

  await waitFor(async () => {
    expect(screen.queryByText("Delete Me")).not.toBeInTheDocument();
    expect(await getBook("book-delete")).toBeNull();
  });
});

it("does not own import or settings actions anymore", async () => {
  render(
    <MemoryRouter>
      <BookshelfPage />
    </MemoryRouter>,
  );

  expect(screen.queryByRole("button", { name: /import epub/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /settings/i })).not.toBeInTheDocument();
});
