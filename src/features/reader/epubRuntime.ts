import ePub, { type Contents, type Location, type NavItem } from "epubjs";
import { loadStoredBookFile } from "../bookshelf/bookFileRepository";
import type { TocItem } from "../../lib/types/books";
import type { ReadingMode } from "../../lib/types/settings";
import { buildReaderTheme, defaultReaderPreferences, type ReaderPreferences, toEpubFlow } from "./readerPreferences";

export type RuntimeRenderArgs = {
  bookId: string;
  element: HTMLElement;
  flow?: ReadingMode;
  initialCfi?: string;
  onRelocated?: (location: { cfi: string; progress: number; spineItemId: string }) => void;
  onSelectionChange?: (selection: { cfiRange: string; text: string }) => void;
  onTocChange?: (toc: TocItem[]) => void;
};

export type RuntimeRenderHandle = {
  applyPreferences(preferences: Partial<ReaderPreferences>): Promise<void>;
  destroy(): void;
  goTo(target: string): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  setFlow(flow: ReadingMode): Promise<void>;
};

export type EpubViewportRuntime = {
  render(args: RuntimeRenderArgs): Promise<RuntimeRenderHandle>;
};

function flattenTocItems(items: NavItem[]): TocItem[] {
  return items.flatMap((item) => [
    {
      id: item.href || item.id,
      label: item.label,
    },
    ...(item.subitems ? flattenTocItems(item.subitems) : []),
  ]);
}

export const epubViewportRuntime: EpubViewportRuntime = {
  async render({ bookId, element, flow = "scrolled", initialCfi, onRelocated, onSelectionChange, onTocChange }) {
    const bookFile = await loadStoredBookFile(bookId);
    const book = ePub(await bookFile.arrayBuffer());
    const rendition = book.renderTo(element, {
      width: "100%",
      height: "100%",
      flow: toEpubFlow(flow),
      allowScriptedContent: false,
    });
    let currentTarget = initialCfi ?? "";
    let activePreferences: ReaderPreferences = {
      ...defaultReaderPreferences,
      readingMode: flow,
    };

    const handleSelection = async (cfiRange: string, contents: Contents) => {
      const range = await book.getRange(cfiRange);
      const text = range?.toString().trim() ?? "";
      onSelectionChange?.({ cfiRange, text });
    };

    const handleRelocated = (location: Location) => {
      const cfi = location.start.cfi;
      const progress = location.start.percentage ?? 0;
      currentTarget = cfi;
      onRelocated?.({ cfi, progress, spineItemId: location.start.href });
    };

    rendition.on("selected", handleSelection);
    rendition.on("relocated", handleRelocated);
    rendition.themes.default(buildReaderTheme(activePreferences));

    const navigation = await book.loaded.navigation;
    onTocChange?.(flattenTocItems(navigation.toc));
    await rendition.display(initialCfi);

    return {
      async applyPreferences(preferences) {
        activePreferences = {
          ...activePreferences,
          ...preferences,
        };
        rendition.themes.default(buildReaderTheme(activePreferences));
      },
      destroy() {
        rendition.off("selected", handleSelection);
        rendition.off("relocated", handleRelocated);
        rendition.destroy();
        book.destroy();
        element.innerHTML = "";
      },
      async goTo(target) {
        currentTarget = target;
        await rendition.display(target);
      },
      next() {
        return rendition.next();
      },
      prev() {
        return rendition.prev();
      },
      async setFlow(nextFlow) {
        activePreferences = {
          ...activePreferences,
          readingMode: nextFlow,
        };
        rendition.flow(toEpubFlow(nextFlow));
        await rendition.display(currentTarget || undefined);
      },
    };
  },
};
