type AppHeaderProps = {
  isImporting: boolean;
  isLibraryOpen: boolean;
  isSettingsOpen: boolean;
  onImportClick: () => void;
  onLibraryClick: () => void;
  onSettingsClick: () => void;
};

export function AppHeader({
  isImporting,
  isLibraryOpen,
  isSettingsOpen,
  onImportClick,
  onLibraryClick,
  onSettingsClick,
}: AppHeaderProps) {
  return (
    <header className="reader-app-header">
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
    </header>
  );
}
