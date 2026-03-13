import { useEffect, useId, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { BookshelfListItem } from "../../lib/types/books";
import { importBook } from "./importBook";
import { deleteBook, listBookshelfItems } from "./bookshelfRepository";
import { BookCard } from "./BookCard";
import { SettingsDialog } from "../settings/SettingsDialog";

type BookshelfPageProps = {
  books?: BookshelfListItem[];
  onImportFile?: (file: File) => Promise<void> | void;
};

export function BookshelfPage({ books = [], onImportFile }: BookshelfPageProps) {
  const navigate = useNavigate();
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
      const record = await importBook(file);
      await refreshBookshelf();
      navigate(`/books/${record.id}`);
    }

    event.target.value = "";
  }

  function handleOpenBook(bookId: string) {
    navigate(`/books/${bookId}`);
  }

  async function handleDeleteBook(bookId: string) {
    if (onImportFile) {
      return;
    }

    await deleteBook(bookId);
    await refreshBookshelf();
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
        <SettingsDialog />
      </section>
      <section aria-label="Local books">
        {visibleBooks.map((book) => (
          <BookCard key={book.id} book={book} onDelete={handleDeleteBook} onOpen={handleOpenBook} />
        ))}
      </section>
    </main>
  );
}
