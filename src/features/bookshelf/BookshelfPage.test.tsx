import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach } from "vitest";
import { resetDb } from "../../lib/db/appDb";
import { saveBook } from "./bookshelfRepository";
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
