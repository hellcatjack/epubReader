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
  cfi?: string;
  spineItemId: string;
  text: string;
};

export type RuntimeRenderHandle = {
  applyPreferences(preferences: Partial<ReaderPreferences>): Promise<void>;
  destroy(): void;
  findCfiFromTextQuote(textQuote: string): Promise<string | null>;
  getTextFromCurrentLocation(): Promise<string>;
  getTtsBlocksFromCurrentLocation?(): Promise<Array<{ cfi?: string; spineItemId: string; text: string }>>;
  goTo(target: string): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  setActiveTtsSegment(segment: ActiveTtsSegment | null): Promise<void>;
  setFlow(flow: ReadingMode): Promise<void>;
};

export type EpubViewportRuntime = {
  render(args: RuntimeRenderArgs): Promise<RuntimeRenderHandle>;
};

function hasDisplayedLocationShape(
  value: unknown,
): value is {
  atEnd: boolean;
  atStart: boolean;
  end: Location["end"];
  start: Location["start"];
} {
  return Boolean(
    value &&
      typeof value === "object" &&
      "start" in value &&
      typeof (value as { start?: unknown }).start === "object" &&
      (value as { start?: { cfi?: unknown } }).start?.cfi,
  );
}

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
    const syncCurrentContents = () => {
      const contents = rendition.getContents();
      const nextContents = Array.isArray(contents) ? contents[0] : contents;

      if (nextContents) {
        currentContents = nextContents;
        applyActiveTtsSegment(activeTtsSegment);
      }
    };

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
      const view = currentContents.window;
      const rect = nextElement.getBoundingClientRect();
      const viewportHeight = view.innerHeight || nextElement.ownerDocument.documentElement.clientHeight || 0;
      const topThreshold = viewportHeight * 0.18;
      const bottomThreshold = viewportHeight * 0.82;
      const needsScroll = rect.top < topThreshold || rect.bottom > bottomThreshold;

      if (needsScroll) {
        nextElement.scrollIntoView?.({
          behavior: "auto",
          block: "nearest",
          inline: "nearest",
        });
      }
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

    const getTtsBlocksFromCurrentLocation = async () => {
      const contents = currentContents;
      if (!contents) {
        return [];
      }

      const doc = contents.document;
      const candidates = Array.from(doc.body.querySelectorAll<HTMLElement>("p, li, blockquote"));
      if (!candidates.length) {
        return [];
      }

      let startNode: Node | null = null;
      let startOffset = 0;

      if (currentTarget) {
        try {
          const range = await book.getRange(currentTarget);
          startNode = range?.startContainer ?? null;
          startOffset = range?.startOffset ?? 0;
        } catch {
          startNode = null;
        }
      }

      const startIndex = startNode
        ? Math.max(
            0,
            candidates.findIndex((candidate) => {
              if (candidate.contains(startNode)) {
                return true;
              }

              return Boolean(startNode.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING);
            }),
          )
        : 0;

      return candidates
        .slice(startIndex)
        .map((candidate, index) => {
          const cfi = contents.cfiFromNode(candidate);
          if (!startNode || index > 0 || !candidate.contains(startNode)) {
            return {
              cfi,
              spineItemId: currentSpineItemId,
              text: normalizeText(candidate.innerText || candidate.textContent || ""),
            };
          }

          const candidateRange = doc.createRange();
          candidateRange.selectNodeContents(candidate);
          candidateRange.setStart(startNode, startOffset);
          return {
            cfi,
            spineItemId: currentSpineItemId,
            text: normalizeText(candidateRange.toString()),
          };
        })
        .filter((block) => Boolean(block.text));
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

    const syncDisplayedLocation = async () => {
      try {
        const displayedLocation = await rendition.currentLocation();
        if (!displayedLocation) {
          return;
        }

        const normalizedLocation = hasDisplayedLocationShape(displayedLocation)
          ? displayedLocation
          : {
              atEnd: false,
              atStart: false,
              end: displayedLocation,
              start: displayedLocation,
            };

        await handleRelocated(normalizedLocation);
      } catch {
        // Ignore synthetic location sync failures and fall back to epub.js events.
      }
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
    syncCurrentContents();
    await syncDisplayedLocation();

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
      getTtsBlocksFromCurrentLocation,
      async goTo(target) {
        currentTarget = target;
        await rendition.display(target);
        syncCurrentContents();
        await syncDisplayedLocation();
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
        syncCurrentContents();
        await syncDisplayedLocation();
      },
    };
  },
};
