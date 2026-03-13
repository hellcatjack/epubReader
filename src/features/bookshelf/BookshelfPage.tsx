import { useEffect, useId, useState, type ChangeEvent } from "react";
import type { BookshelfListItem } from "../../lib/types/books";
import { importBook } from "./importBook";
import { listBookshelfItems } from "./bookshelfRepository";
import { BookCard } from "./BookCard";

type BookshelfPageProps = {
  books?: BookshelfListItem[];
  onImportFile?: (file: File) => Promise<void> | void;
};

export function BookshelfPage({ books = [], onImportFile }: BookshelfPageProps) {
  const importInputId = useId();
  const [storedBooks, setStoredBooks] = useState<BookshelfListItem[]>([]);
  const usesExternalBooks = onImportFile != null || books.length > 0;
  const visibleBooks = usesExternalBooks ? books : storedBooks;

  async function refreshBookshelf() {
    setStoredBooks(await listBookshelfItems());
  }

  useEffect(() => {
    if (usesExternalBooks) {
      return;
    }

    void refreshBookshelf();
  }, [usesExternalBooks]);

  async function handleImportChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (onImportFile) {
      await onImportFile(file);
    } else {
      await importBook(file);
      await refreshBookshelf();
    }

    event.target.value = "";
  }

  return (
    <main>
      <h1>Bookshelf</h1>
      <section aria-label="Bookshelf actions">
        <label htmlFor={importInputId}>Import EPUB</label>
        <input
          id={importInputId}
          accept=".epub,application/epub+zip"
          onChange={handleImportChange}
          type="file"
        />
      </section>
      <section aria-label="Local books">
        {visibleBooks.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </section>
    </main>
  );
}
