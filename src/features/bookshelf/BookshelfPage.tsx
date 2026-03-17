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
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const usesExternalBooks = onImportFile != null || books.length > 0;
  const visibleBooks = usesExternalBooks ? books : storedBooks;
  const continueReadingBook = visibleBooks
    .filter((book) => typeof book.lastReadAt === "number")
    .sort((left, right) => (right.lastReadAt ?? 0) - (left.lastReadAt ?? 0))[0];

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

    let nextBookId = "";

    setIsImporting(true);
    setImportError("");

    try {
      if (onImportFile) {
        await onImportFile(file);
      } else {
        const record = await importBook(file);
        await refreshBookshelf();
        nextBookId = record.id;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setImportError(`Import failed: ${message}`);
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }

    if (nextBookId) {
      navigate(`/books/${nextBookId}`);
    }
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
        {isImporting ? <p role="status">Importing EPUB...</p> : null}
        {importError ? <p role="alert">{importError}</p> : null}
        <SettingsDialog />
      </section>
      {continueReadingBook ? (
        <section aria-label="Continue reading">
          <h2>Continue reading</h2>
          <p>{continueReadingBook.title}</p>
          <p>{continueReadingBook.author}</p>
          <p>{continueReadingBook.progressLabel}</p>
          <button type="button" onClick={() => handleOpenBook(continueReadingBook.id)}>
            Continue {continueReadingBook.title}
          </button>
        </section>
      ) : null}
      <section aria-label="Local books">
        {visibleBooks.map((book) => (
          <BookCard key={book.id} book={book} onDelete={handleDeleteBook} onOpen={handleOpenBook} />
        ))}
      </section>
    </main>
  );
}
