import type { BookshelfListItem } from "../lib/types/books";

type AppHeaderProps = {
  currentBook: Pick<BookshelfListItem, "author" | "progressLabel" | "title"> | null;
  isImporting: boolean;
  isReaderRoute: boolean;
  isLibraryOpen: boolean;
  isSettingsOpen: boolean;
  onImportClick: () => void;
  onLibraryClick: () => void;
  onSettingsClick: () => void;
};

export function AppHeader({
  currentBook,
  isImporting,
  isReaderRoute,
  isLibraryOpen,
  isSettingsOpen,
  onImportClick,
  onLibraryClick,
  onSettingsClick,
}: AppHeaderProps) {
  const heading = currentBook?.title ?? (isReaderRoute ? "Opening book..." : "Your library");

  return (
    <div className="reader-app-header">
      <div className="reader-app-header-bar">
      <nav aria-label="Reader app navigation" className="reader-app-nav">
        <button
          type="button"
          className="reader-app-nav-button"
          aria-expanded={isLibraryOpen}
          onClick={onLibraryClick}
        >
          Library
        </button>
        <button
          type="button"
          className="reader-app-nav-button"
          disabled={isImporting}
          onClick={onImportClick}
        >
          {isImporting ? "Importing EPUB..." : "Import EPUB"}
        </button>
        <button
          type="button"
          className="reader-app-nav-button"
          aria-expanded={isSettingsOpen}
          onClick={onSettingsClick}
        >
          Settings
        </button>
      </nav>
        <section aria-live="polite" className="reader-app-context" aria-label="Reader app context">
          <p className="reader-app-context-eyebrow">{isReaderRoute ? "Now reading" : "Library workspace"}</p>
          <div className="reader-app-context-copy">
            <h1>{heading}</h1>
            {currentBook ? (
              <div className="reader-app-context-meta">
                <span>{currentBook.author}</span>
                <span>{currentBook.progressLabel}</span>
              </div>
            ) : (
              <p>Import, switch books, and adjust settings without breaking your reading flow.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
