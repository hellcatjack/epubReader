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
  initialPageIndex?: number;
  initialPageOffset?: number;
  onRelocated?: (location: { cfi: string; pageIndex?: number; pageOffset?: number; progress: number; spineItemId: string; textQuote: string }) => void;
  onSelectionChange?: (selection: { cfiRange: string; isReleased?: boolean; spineItemId: string; text: string }) => void;
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
  getCurrentLocation?(): Promise<{ cfi: string; pageIndex?: number; pageOffset?: number; progress: number; spineItemId: string; textQuote: string } | null>;
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

const ttsBlockSelector = "p, li, blockquote";

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

function normalizeSegmentText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function getPaginatedContainer(root: ParentNode | null) {
  return root?.querySelector<HTMLElement>(".epub-container") ?? null;
}

function readPaginatedPageOffset(readingMode: ReadingMode, container: HTMLElement | null) {
  if (readingMode !== "paginated" || !container) {
    return undefined;
  }

  return Math.max(0, container.scrollLeft);
}

export function readPaginatedPageIndex(readingMode: ReadingMode, container: HTMLElement | null) {
  if (readingMode !== "paginated" || !container || container.clientWidth <= 0) {
    return undefined;
  }

  return Math.max(0, Math.round(container.scrollLeft / container.clientWidth));
}

export function restorePaginatedPageOffset(
  readingMode: ReadingMode,
  container: HTMLElement | null,
  pageOffset?: number,
) {
  if (readingMode !== "paginated" || !container || typeof pageOffset !== "number" || !Number.isFinite(pageOffset)) {
    return;
  }

  container.scrollLeft = Math.max(0, pageOffset);
}

export function restorePaginatedPagePosition(
  readingMode: ReadingMode,
  container: HTMLElement | null,
  pageOffset?: number,
  pageIndex?: number,
) {
  if (readingMode !== "paginated" || !container) {
    return;
  }

  if (typeof pageIndex === "number" && Number.isFinite(pageIndex) && container.clientWidth > 0) {
    container.scrollLeft = Math.max(0, Math.round(pageIndex) * container.clientWidth);
    return;
  }

  if (typeof pageOffset === "number" && Number.isFinite(pageOffset)) {
    if (container.clientWidth > 0) {
      container.scrollLeft = Math.max(0, Math.round(pageOffset / container.clientWidth) * container.clientWidth);
      return;
    }

    container.scrollLeft = Math.max(0, pageOffset);
  }
}

export function shouldAutoScrollTtsSegment(
  readingMode: ReadingMode,
  rect: Pick<DOMRect, "top" | "bottom">,
  viewportHeight: number,
) {
  if (readingMode === "paginated" || viewportHeight <= 0) {
    return false;
  }

  const topThreshold = viewportHeight * 0.18;
  const bottomThreshold = viewportHeight * 0.82;
  return rect.top < topThreshold || rect.bottom > bottomThreshold;
}

export function getNearestTtsBlockElement(node: Node | null) {
  if (!node) {
    return null;
  }

  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>(ttsBlockSelector) ?? null;
}

export function findTtsBlockElementByText(root: ParentNode, text: string) {
  const normalizedSegment = normalizeSegmentText(text);
  if (!normalizedSegment) {
    return null;
  }

  const candidates = Array.from(root.querySelectorAll<HTMLElement>(ttsBlockSelector));
  let prefixMatch: HTMLElement | null = null;
  const segmentPrefix = normalizedSegment.slice(0, Math.min(normalizedSegment.length, 120));

  for (const candidate of candidates) {
    const candidateText = normalizeSegmentText(candidate.innerText || candidate.textContent || "");
    if (!candidateText) {
      continue;
    }

    if (normalizedSegment === candidateText || normalizedSegment.includes(candidateText)) {
      return candidate;
    }

    if (!prefixMatch && segmentPrefix && candidateText.includes(segmentPrefix)) {
      prefixMatch = candidate;
    }
  }

  return prefixMatch;
}

export const epubViewportRuntime: EpubViewportRuntime = {
  async render({
    bookId,
    element,
    flow = "scrolled",
    initialCfi,
    initialPageIndex,
    initialPageOffset,
    onRelocated,
    onSelectionChange,
    onTocChange,
  }) {
    const bookFile = await loadStoredBookFile(bookId);
    const book = ePub(await bookFile.arrayBuffer());
    const rendition = book.renderTo(element, {
      width: "100%",
      height: "100%",
      flow: toEpubFlow(flow),
      spread: flow === "paginated" ? "none" : "auto",
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
    let pointerSelecting = false;
    let pendingSelection: { cfiRange: string; isReleased?: boolean; spineItemId: string; text: string } | null = null;
    const selectionDocumentCleanups = new Map<Document, () => void>();

    const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim();
    const syncCurrentContents = () => {
      const contents = rendition.getContents();
      const nextContents = Array.isArray(contents) ? contents[0] : contents;

      if (nextContents) {
        currentContents = nextContents;
        attachSelectionLifecycle(nextContents);
        void applyActiveTtsSegment(activeTtsSegment);
      }
    };

    const clearActiveTtsSegment = () => {
      activeTtsElement?.classList.remove("reader-tts-active-segment");
      activeTtsElement = null;
    };

    const findSegmentElement = async (contents: Contents, segment: ActiveTtsSegment) => {
      if (segment.cfi) {
        try {
          const range = await book.getRange(segment.cfi);
          const block = getNearestTtsBlockElement(range?.startContainer ?? null);
          if (block && contents.document.body.contains(block)) {
            return block;
          }
        } catch {
          // Fall back to text targeting when the stored CFI cannot be resolved in the current rendition.
        }
      }

      return findTtsBlockElementByText(contents.document.body, segment.text);
    };

    let activeTtsLookupToken = 0;

    const applyActiveTtsSegment = async (segment: ActiveTtsSegment | null) => {
      activeTtsSegment = segment;
      clearActiveTtsSegment();

      if (!segment || !currentContents) {
        return;
      }

      if (segment.spineItemId && currentSpineItemId && segment.spineItemId !== currentSpineItemId) {
        return;
      }

      const lookupToken = ++activeTtsLookupToken;
      const nextElement = await findSegmentElement(currentContents, segment);
      if (lookupToken !== activeTtsLookupToken) {
        return;
      }

      if (!nextElement) {
        return;
      }

      nextElement.classList.add("reader-tts-active-segment");
      activeTtsElement = nextElement;
      const view = currentContents.window;
      const rect = nextElement.getBoundingClientRect();
      const viewportHeight = view.innerHeight || nextElement.ownerDocument.documentElement.clientHeight || 0;
      const needsScroll = shouldAutoScrollTtsSegment(activePreferences.readingMode, rect, viewportHeight);

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

    const toStoredLocation = async (location: Location) => {
      const cfi = location.start.cfi;
      const progress = location.start.percentage ?? 0;
      const spineItemId = location.start.href;
      const textQuote = await getLocationTextQuote(cfi);

      return {
        cfi,
        pageIndex: readPaginatedPageIndex(activePreferences.readingMode, getPaginatedContainer(element)),
        pageOffset: readPaginatedPageOffset(activePreferences.readingMode, getPaginatedContainer(element)),
        progress,
        spineItemId,
        textQuote,
      };
    };

    const flushPendingSelection = () => {
      if (!pendingSelection) {
        return;
      }

      onSelectionChange?.({
        ...pendingSelection,
        isReleased: true,
      });
      pendingSelection = null;
    };

    const attachSelectionLifecycle = (contents: Contents) => {
      const doc = contents.document;
      if (selectionDocumentCleanups.has(doc)) {
        return;
      }

      const handlePointerDown = () => {
        pointerSelecting = true;
      };

      const handlePointerUp = () => {
        pointerSelecting = false;
        flushPendingSelection();
      };

      doc.addEventListener("mousedown", handlePointerDown, true);
      doc.addEventListener("mouseup", handlePointerUp, true);
      doc.addEventListener("touchstart", handlePointerDown, true);
      doc.addEventListener("touchend", handlePointerUp, true);

      selectionDocumentCleanups.set(doc, () => {
        doc.removeEventListener("mousedown", handlePointerDown, true);
        doc.removeEventListener("mouseup", handlePointerUp, true);
        doc.removeEventListener("touchstart", handlePointerDown, true);
        doc.removeEventListener("touchend", handlePointerUp, true);
      });
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
      const selection = {
        cfiRange,
        isReleased: !pointerSelecting,
        spineItemId: currentSpineItemId,
        text,
      };

      if (pointerSelecting) {
        pendingSelection = selection;
      }

      onSelectionChange?.(selection);
    };

    const handleRelocated = async (location: Location) => {
      const storedLocation = await toStoredLocation(location);
      currentTarget = storedLocation.cfi;
      currentSpineItemId = storedLocation.spineItemId;
      onRelocated?.(storedLocation);
    };

    const getDisplayedLocation = async () => {
      try {
        const displayedLocation = await rendition.currentLocation();
        if (!displayedLocation) {
          return null;
        }

        const normalizedLocation = hasDisplayedLocationShape(displayedLocation)
          ? displayedLocation
          : {
              atEnd: false,
              atStart: false,
              end: displayedLocation,
              start: displayedLocation,
            };

        return normalizedLocation;
      } catch {
        // Ignore synthetic location sync failures and fall back to epub.js events.
        return null;
      }
    };

    const syncDisplayedLocation = async () => {
      const displayedLocation = await getDisplayedLocation();
      if (!displayedLocation) {
        return;
      }

      await handleRelocated(displayedLocation);
    };

    const handleRendered = (_section: unknown, contents: Contents) => {
      currentContents = contents;
      attachSelectionLifecycle(contents);
      void applyActiveTtsSegment(activeTtsSegment);
    };

    rendition.on("selected", handleSelection);
    rendition.on("relocated", handleRelocated);
    rendition.on("rendered", handleRendered);
    rendition.themes.default(buildReaderTheme(activePreferences));

    const navigation = await book.loaded.navigation;
    onTocChange?.(flattenTocItems(navigation.toc));
    await rendition.display(initialCfi);
    syncCurrentContents();
    restorePaginatedPagePosition(flow, getPaginatedContainer(element), initialPageOffset, initialPageIndex);
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
        selectionDocumentCleanups.forEach((cleanup) => cleanup());
        selectionDocumentCleanups.clear();
        rendition.off("selected", handleSelection);
        rendition.off("relocated", handleRelocated);
        rendition.off("rendered", handleRendered);
        rendition.destroy();
        book.destroy();
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
      async getCurrentLocation() {
        const displayedLocation = await getDisplayedLocation();
        if (displayedLocation) {
          return toStoredLocation(displayedLocation);
        }

        if (!currentTarget) {
          return null;
        }

        return {
          cfi: currentTarget,
          pageIndex: readPaginatedPageIndex(activePreferences.readingMode, getPaginatedContainer(element)),
          pageOffset: readPaginatedPageOffset(activePreferences.readingMode, getPaginatedContainer(element)),
          progress: 0,
          spineItemId: currentSpineItemId,
          textQuote: await getLocationTextQuote(currentTarget),
        };
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
      async next() {
        await rendition.next();
        syncCurrentContents();
        await syncDisplayedLocation();
      },
      async prev() {
        await rendition.prev();
        syncCurrentContents();
        await syncDisplayedLocation();
      },
      async setActiveTtsSegment(segment) {
        await applyActiveTtsSegment(segment);
      },
      async setFlow(nextFlow) {
        activePreferences = {
          ...activePreferences,
          readingMode: nextFlow,
        };
        rendition.flow(toEpubFlow(nextFlow));
        rendition.spread(nextFlow === "paginated" ? "none" : "auto");
        await rendition.display(currentTarget || undefined);
        syncCurrentContents();
        await syncDisplayedLocation();
      },
    };
  },
};
