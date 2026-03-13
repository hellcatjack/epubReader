type TocItem = {
  id: string;
  label: string;
};

type ReaderBook = {
  getToc(): Promise<TocItem[]>;
  display(cfi?: string): Promise<void>;
  destroy(): void;
};

type ReaderControllerDeps = {
  loadBook(bookId: string): Promise<Blob>;
  createBook(blob: Blob): Promise<ReaderBook>;
};

export function createReaderController({ loadBook, createBook }: ReaderControllerDeps) {
  let currentCfi = "";
  let currentBook: ReaderBook | null = null;

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
      currentCfi = cfi ?? "";

      await currentBook.display(cfi);
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
    },
  };
}
