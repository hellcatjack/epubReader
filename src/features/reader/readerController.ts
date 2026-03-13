import type { ChapterChange, TocItem } from "../../lib/types/books";
import { selectionBridge, type ReaderSelection } from "./selectionBridge";

type ReaderBook = {
  getToc(): Promise<TocItem[]>;
  display(cfi?: string): Promise<void>;
  destroy(): void;
};

type ChapterChangeListener = (change: ChapterChange) => void;
type SelectionListener = (selection: ReaderSelection | null) => void;

type ReaderControllerDeps = {
  loadBook(bookId: string): Promise<Blob>;
  createBook(blob: Blob): Promise<ReaderBook>;
};

export type ReaderController = {
  mode: "paginated";
  sandbox: string;
  readonly currentCfi: string;
  open(bookId: string, cfi?: string): Promise<void>;
  getToc(): Promise<TocItem[]>;
  goToLocation(cfi: string): Promise<void>;
  observeSelection(listener: SelectionListener): () => void;
  observeChapterChanges(listener: ChapterChangeListener): () => void;
};

export function createReaderController({ loadBook, createBook }: ReaderControllerDeps) {
  let currentCfi = "";
  let currentBook: ReaderBook | null = null;
  const chapterListeners = new Set<ChapterChangeListener>();

  function notifyChapterChange(cfi: string) {
    chapterListeners.forEach((listener) => listener({ cfi }));
  }

  return {
    mode: "paginated" as const,
    sandbox: "allow-same-origin",
    get currentCfi() {
      return currentCfi;
    },
    async open(bookId: string, cfi?: string) {
      currentBook?.destroy();

      const blob = await loadBook(bookId);
      currentBook = await createBook(blob);

      await currentBook.display(cfi);
      currentCfi = cfi ?? "";
      notifyChapterChange(currentCfi);
    },
    async getToc() {
      if (!currentBook) {
        return [];
      }

      return currentBook.getToc();
    },
    async goToLocation(cfi: string) {
      if (!currentBook) {
        return;
      }

      currentCfi = cfi;
      await currentBook.display(cfi);
      notifyChapterChange(currentCfi);
    },
    observeSelection(listener: SelectionListener) {
      return selectionBridge.subscribe(listener);
    },
    observeChapterChanges(listener: ChapterChangeListener) {
      chapterListeners.add(listener);

      return () => {
        chapterListeners.delete(listener);
      };
    },
  } satisfies ReaderController;
}
