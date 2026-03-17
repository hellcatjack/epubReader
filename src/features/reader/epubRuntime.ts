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
  onRelocated?: (location: { cfi: string; progress: number; spineItemId: string; textQuote: string }) => void;
  onSelectionChange?: (selection: { cfiRange: string; text: string }) => void;
  onTocChange?: (toc: TocItem[]) => void;
};

export type ActiveTtsSegment = {
  spineItemId: string;
  text: string;
};

export type RuntimeRenderHandle = {
  applyPreferences(preferences: Partial<ReaderPreferences>): Promise<void>;
  destroy(): void;
  findCfiFromTextQuote(textQuote: string): Promise<string | null>;
  getTextFromCurrentLocation(): Promise<string>;
  goTo(target: string): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  setActiveTtsSegment(segment: ActiveTtsSegment | null): Promise<void>;
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
    let currentContents: Contents | null = null;
    let currentSpineItemId = "";
    let activePreferences: ReaderPreferences = {
      ...defaultReaderPreferences,
      readingMode: flow,
    };
    let activeTtsSegment: ActiveTtsSegment | null = null;
    let activeTtsElement: HTMLElement | null = null;

    const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim();

    const clearActiveTtsSegment = () => {
      activeTtsElement?.classList.remove("reader-tts-active-segment");
      activeTtsElement = null;
    };

    const findSegmentElement = (contents: Contents, text: string) => {
      const normalizedSegment = normalizeText(text);
      if (!normalizedSegment) {
        return null;
      }

      const doc = contents.document;
      const candidates = Array.from(
        doc.body.querySelectorAll<HTMLElement>("p, li, blockquote, h1, h2, h3, h4, h5, h6, div"),
      );

      let prefixMatch: HTMLElement | null = null;
      const segmentPrefix = normalizedSegment.slice(0, Math.min(normalizedSegment.length, 120));

      for (const candidate of candidates) {
        const candidateText = normalizeText(candidate.innerText || candidate.textContent || "");
        if (!candidateText) {
          continue;
        }

        if (normalizedSegment.includes(candidateText)) {
          return candidate;
        }

        if (!prefixMatch && segmentPrefix && candidateText.includes(segmentPrefix)) {
          prefixMatch = candidate;
        }
      }

      return prefixMatch;
    };

    const applyActiveTtsSegment = (segment: ActiveTtsSegment | null) => {
      activeTtsSegment = segment;
      clearActiveTtsSegment();

      if (!segment || !currentContents) {
        return;
      }

      if (segment.spineItemId && currentSpineItemId && segment.spineItemId !== currentSpineItemId) {
        return;
      }

      const nextElement = findSegmentElement(currentContents, segment.text);
      if (!nextElement) {
        return;
      }

      nextElement.classList.add("reader-tts-active-segment");
      activeTtsElement = nextElement;
      nextElement.scrollIntoView?.({
        block: "center",
        inline: "nearest",
      });
    };

    const getLocationTextQuote = async (cfi: string) => {
      const fallbackText = normalizeText(currentContents?.document.body?.innerText ?? "");
      if (!cfi) {
        return fallbackText.slice(0, 180);
      }

      try {
        const range = await book.getRange(cfi);
        const body = range?.startContainer?.ownerDocument?.body;
        if (!range || !body) {
          return fallbackText.slice(0, 180);
        }

        const readingRange = body.ownerDocument.createRange();
        readingRange.setStart(range.startContainer, range.startOffset);
        readingRange.setEnd(body, body.childNodes.length);
        return normalizeText(readingRange.toString()).slice(0, 180) || fallbackText.slice(0, 180);
      } catch {
        return fallbackText.slice(0, 180);
      }
    };

    const handleSelection = async (cfiRange: string, contents: Contents) => {
      const range = await book.getRange(cfiRange);
      const text = range?.toString().trim() ?? "";
      onSelectionChange?.({ cfiRange, text });
    };

    const handleRelocated = async (location: Location) => {
      const cfi = location.start.cfi;
      const progress = location.start.percentage ?? 0;
      currentTarget = cfi;
      currentSpineItemId = location.start.href;
      const textQuote = await getLocationTextQuote(cfi);
      onRelocated?.({ cfi, progress, spineItemId: location.start.href, textQuote });
    };

    const handleRendered = (_section: unknown, contents: Contents) => {
      currentContents = contents;
      applyActiveTtsSegment(activeTtsSegment);
    };

    rendition.on("selected", handleSelection);
    rendition.on("relocated", handleRelocated);
    rendition.on("rendered", handleRendered);
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
        clearActiveTtsSegment();
        rendition.off("selected", handleSelection);
        rendition.off("relocated", handleRelocated);
        rendition.off("rendered", handleRendered);
        rendition.destroy();
        book.destroy();
        element.innerHTML = "";
      },
      async findCfiFromTextQuote(textQuote) {
        if (!currentContents) {
          return null;
        }

        const normalizedQuote = normalizeText(textQuote);
        if (!normalizedQuote) {
          return null;
        }

        const candidates = Array.from(
          currentContents.document.body.querySelectorAll<HTMLElement>("p, li, blockquote, h1, h2, h3, h4, h5, h6, div"),
        );

        for (const candidate of candidates) {
          const candidateText = normalizeText(candidate.innerText || candidate.textContent || "");
          if (!candidateText) {
            continue;
          }

          if (candidateText.includes(normalizedQuote) || normalizedQuote.includes(candidateText.slice(0, 80))) {
            return currentContents.cfiFromNode(candidate);
          }
        }

        return null;
      },
      async getTextFromCurrentLocation() {
        const fallbackText = normalizeText(currentContents?.document.body?.innerText ?? "");
        if (!currentTarget) {
          return fallbackText;
        }

        try {
          const range = await book.getRange(currentTarget);
          const body = range?.startContainer?.ownerDocument?.body;
          if (!range || !body) {
            return fallbackText;
          }

          const readingRange = body.ownerDocument.createRange();
          readingRange.setStart(range.startContainer, range.startOffset);
          readingRange.setEnd(body, body.childNodes.length);
          const text = normalizeText(readingRange.toString());
          return text || fallbackText;
        } catch {
          return fallbackText;
        }
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
      async setActiveTtsSegment(segment) {
        applyActiveTtsSegment(segment);
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
