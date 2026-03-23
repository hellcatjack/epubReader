import type { BookshelfListItem } from "../lib/types/books";

export type ReaderAppShellContext = {
  currentBook: Pick<BookshelfListItem, "author" | "progressLabel" | "title"> | null;
  isImporting: boolean;
  isLibraryOpen: boolean;
  isSettingsOpen: boolean;
  onImportClick: () => void;
  onLibraryClick: () => void;
  onSettingsClick: () => void;
};
