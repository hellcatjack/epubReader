import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { listBookshelfItems } from "../features/bookshelf/bookshelfRepository";
import { importBook } from "../features/bookshelf/importBook";
import { SettingsDialog } from "../features/settings/SettingsDialog";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { AppHeader } from "./AppHeader";
import { LibraryDrawer } from "./LibraryDrawer";
import type { ReaderAppShellContext } from "./readerAppShellContext";
import "./readerAppShell.css";

const shellContext: ReaderAppShellContext = {};

export function ReaderAppShell() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function refreshLibrary() {
    await listBookshelfItems();
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
      navigate(`/books/${importedBook.id}`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to import EPUB.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="reader-app-shell">
      <AppHeader
        isImporting={isImporting}
        isLibraryOpen={isLibraryOpen}
        isSettingsOpen={isSettingsOpen}
        onImportClick={() => fileInputRef.current?.click()}
        onLibraryClick={() => setIsLibraryOpen(true)}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />
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
        <p>Library drawer content arrives in Task 4.</p>
      </LibraryDrawer>
      <SettingsPanel open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)}>
        <SettingsDialog />
      </SettingsPanel>
      <Outlet context={shellContext} />
    </div>
  );
}
