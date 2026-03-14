import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, vi } from "vitest";
import { resetDb } from "../../lib/db/appDb";
import { getBook, saveBook } from "./bookshelfRepository";
import { BookshelfPage } from "./BookshelfPage";

afterEach(async () => {
  await resetDb();
});

async function loadFixtureFile(name: string) {
  const buffer = await readFile(resolve("tests/fixtures/epub", name));
  return new File([buffer], name, { type: "application/epub+zip" });
}

it("renders imported books with progress and reopens from saved progress", async () => {
  render(
    <MemoryRouter>
      <BookshelfPage
        books={[
          {
            id: "book-1",
            title: "Minimal Valid EPUB",
            author: "Author",
            progressLabel: "20% read",
          },
        ]}
      />
    </MemoryRouter>,
  );

  expect(await screen.findByText("Minimal Valid EPUB")).toBeInTheDocument();
  expect(screen.getByText("Author")).toBeInTheDocument();
  expect(screen.getByText("20% read")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /minimal valid epub/i })).toHaveAttribute(
    "href",
    "/books/book-1",
  );
});

it("forwards imported epub files through the import action", async () => {
  const user = userEvent.setup();
  const onImportFile = vi.fn(async () => undefined);
  const file = new File(["epub-bytes"], "demo.epub", { type: "application/epub+zip" });

  render(
    <MemoryRouter>
      <BookshelfPage books={[]} onImportFile={onImportFile} />
    </MemoryRouter>,
  );

  await user.upload(screen.getByLabelText(/import epub/i), file);

  expect(onImportFile).toHaveBeenCalledWith(file);
});

it("shows an importing status while the selected file is being processed", async () => {
  const user = userEvent.setup();
  const importDeferred: { resolve: null | (() => void) } = { resolve: null };
  const onImportFile = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        importDeferred.resolve = resolve;
      }),
  );
  const file = new File(["epub-bytes"], "demo.epub", { type: "application/epub+zip" });

  render(
    <MemoryRouter>
      <BookshelfPage books={[]} onImportFile={onImportFile} />
    </MemoryRouter>,
  );

  await user.upload(screen.getByLabelText(/import epub/i), file);

  expect(await screen.findByRole("status")).toHaveTextContent("Importing EPUB...");

  importDeferred.resolve?.();
});

it("shows a visible error when importing fails", async () => {
  const user = userEvent.setup();
  const onImportFile = vi.fn(async () => {
    throw new Error("Broken archive");
  });
  const file = new File(["epub-bytes"], "broken.epub", { type: "application/epub+zip" });

  render(
    <MemoryRouter>
      <BookshelfPage books={[]} onImportFile={onImportFile} />
    </MemoryRouter>,
  );

  await user.upload(screen.getByLabelText(/import epub/i), file);

  expect(await screen.findByRole("alert")).toHaveTextContent("Import failed: Broken archive");
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

it("imports an epub into the persisted bookshelf when using the default import flow", async () => {
  const user = userEvent.setup();
  const file = await loadFixtureFile("minimal-valid.epub");

  render(
    <MemoryRouter>
      <BookshelfPage />
    </MemoryRouter>,
  );

  await user.upload(screen.getByLabelText(/import epub/i), file);

  expect(await screen.findByText("Minimal Valid EPUB")).toBeInTheDocument();
  expect(screen.getByText("Author")).toBeInTheDocument();
});

it("opens the reader route immediately after a successful default import", async () => {
  const user = userEvent.setup();
  const file = await loadFixtureFile("minimal-valid.epub");

  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<BookshelfPage />} />
        <Route path="/books/:bookId" element={<p>Reader route opened</p>} />
      </Routes>
    </MemoryRouter>,
  );

  await user.upload(screen.getByLabelText(/import epub/i), file);

  expect(await screen.findByText("Reader route opened")).toBeInTheDocument();
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
