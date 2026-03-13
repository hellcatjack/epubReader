import ePub, { type Contents, type Location, type NavItem } from "epubjs";
import { loadStoredBookFile } from "../bookshelf/bookFileRepository";
import type { TocItem } from "../../lib/types/books";

export type RuntimeRenderArgs = {
  bookId: string;
  element: HTMLElement;
  initialCfi?: string;
  onRelocated?: (location: { cfi: string; progress: number; spineItemId: string }) => void;
  onSelectionChange?: (selection: { cfiRange: string; text: string }) => void;
  onTocChange?: (toc: TocItem[]) => void;
};

export type RuntimeRenderHandle = {
  destroy(): void;
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
  async render({ bookId, element, initialCfi, onRelocated, onSelectionChange, onTocChange }) {
    const bookFile = await loadStoredBookFile(bookId);
    const book = ePub(await bookFile.arrayBuffer());
    const rendition = book.renderTo(element, {
      width: "100%",
      height: "100%",
      flow: "paginated",
      allowScriptedContent: false,
    });

    const handleSelection = async (cfiRange: string, contents: Contents) => {
      const range = await book.getRange(cfiRange);
      const text = range?.toString().trim() ?? "";
      onSelectionChange?.({ cfiRange, text });
      contents.window.getSelection()?.removeAllRanges();
    };

    const handleRelocated = (location: Location) => {
      const cfi = location.start.cfi;
      const progress = location.start.percentage ?? 0;
      onRelocated?.({ cfi, progress, spineItemId: location.start.href });
    };

    rendition.on("selected", handleSelection);
    rendition.on("relocated", handleRelocated);

    const navigation = await book.loaded.navigation;
    onTocChange?.(flattenTocItems(navigation.toc));
    await rendition.display(initialCfi);

    return {
      destroy() {
        rendition.off("selected", handleSelection);
        rendition.off("relocated", handleRelocated);
        rendition.destroy();
        book.destroy();
        element.innerHTML = "";
      },
    };
  },
};
