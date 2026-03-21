import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BookshelfListItem } from "../../lib/types/books";
import { deleteBook, listBookshelfItems } from "./bookshelfRepository";
import { LibraryPanel } from "./LibraryPanel";
import "./bookshelf.css";

export function BookshelfPage() {
  const navigate = useNavigate();
  const [storedBooks, setStoredBooks] = useState<BookshelfListItem[]>([]);

  async function refreshBookshelf() {
    setStoredBooks(await listBookshelfItems());
  }

  useEffect(() => {
    void refreshBookshelf();
  }, []);

  function handleOpenBook(bookId: string) {
    navigate(`/books/${bookId}`);
  }

  async function handleDeleteBook(bookId: string) {
    await deleteBook(bookId);
    await refreshBookshelf();
  }

  return (
    <main className="bookshelf-page">
      <LibraryPanel books={storedBooks} onDeleteBook={handleDeleteBook} onOpenBook={handleOpenBook} />
    </main>
  );
}
