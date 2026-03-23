import { useEffect, useRef, useState } from "react";
import { Outlet, useMatch, useNavigate } from "react-router-dom";
import type { BookshelfListItem } from "../lib/types/books";
import { deleteBook, listBookshelfItems } from "../features/bookshelf/bookshelfRepository";
import { importBook } from "../features/bookshelf/importBook";
import { LibraryPanel } from "../features/bookshelf/LibraryPanel";
import { SettingsDialog } from "../features/settings/SettingsDialog";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { AppHeader } from "./AppHeader";
import { LibraryDrawer } from "./LibraryDrawer";
import type { ReaderAppShellContext } from "./readerAppShellContext";
import "./readerAppShell.css";

export function ReaderAppShell() {
  const navigate = useNavigate();
  const readerRouteMatch = useMatch("/books/:bookId");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [libraryItems, setLibraryItems] = useState<BookshelfListItem[]>([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const currentBookId = readerRouteMatch?.params.bookId ?? null;
  const isReaderRoute = Boolean(currentBookId);
  const currentBook = currentBookId ? libraryItems.find((book) => book.id === currentBookId) ?? null : null;

  async function refreshLibrary() {
    const books = await listBookshelfItems();
    setLibraryItems(books);
    return books;
  }

  useEffect(() => {
    void refreshLibrary();
  }, []);

  async function handleImportFile(file: File) {
    setIsImporting(true);
    setImportError(null);

    try {
      const importedBook = await importBook(file);
      await refreshLibrary();
      setIsLibraryOpen(false);
      navigate(`/books/${importedBook.id}`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to import EPUB.");
    } finally {
      setIsImporting(false);
    }
  }

  function handleLibraryClick() {
    if (!currentBookId) {
      navigate("/");
      return;
    }

    void refreshLibrary();
    setIsLibraryOpen(true);
  }

  function handleOpenBook(bookId: string) {
    setIsLibraryOpen(false);
    navigate(`/books/${bookId}`);
  }

  async function handleDeleteBook(bookId: string) {
    await deleteBook(bookId);
    const books = await refreshLibrary();

    if (currentBookId === bookId && !books.some((book) => book.id === bookId)) {
      setIsLibraryOpen(false);
      navigate("/");
    }
  }

  const shellContext: ReaderAppShellContext = {
    currentBook,
    isImporting,
    isLibraryOpen,
    isSettingsOpen,
    onImportClick: () => fileInputRef.current?.click(),
    onLibraryClick: handleLibraryClick,
    onSettingsClick: () => setIsSettingsOpen(true),
  };

  return (
    <div className={`reader-app-shell ${isReaderRoute ? "reader-app-shell-reader" : "reader-app-shell-home"}`}>
      {!isReaderRoute ? (
        <AppHeader
          currentBook={currentBook}
          isImporting={isImporting}
          isReaderRoute={false}
          isLibraryOpen={isLibraryOpen}
          isSettingsOpen={isSettingsOpen}
          onImportClick={shellContext.onImportClick}
          onLibraryClick={shellContext.onLibraryClick}
          onSettingsClick={shellContext.onSettingsClick}
        />
      ) : null}
      <input
        ref={fileInputRef}
        aria-label="Import EPUB"
        className="reader-app-shell-input"
        type="file"
        accept=".epub,application/epub+zip"
        onChange={(event) => {
          const [file] = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";

          if (!file) {
            return;
          }

          void handleImportFile(file);
        }}
      />
      {importError ? (
        <p className="reader-app-shell-feedback" role="alert">
          {importError}
        </p>
      ) : null}
      <LibraryDrawer open={isLibraryOpen} onClose={() => setIsLibraryOpen(false)}>
        <LibraryPanel books={libraryItems} mode="drawer" onDeleteBook={handleDeleteBook} onOpenBook={handleOpenBook} />
      </LibraryDrawer>
      <SettingsPanel open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)}>
        <SettingsDialog />
      </SettingsPanel>
      <div className="reader-app-shell-workspace">
        <Outlet context={shellContext} />
      </div>
    </div>
  );
}
