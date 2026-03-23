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
  initialPreferences?: Partial<ReaderPreferences>;
  onRelocated?: (location: { cfi: string; pageIndex?: number; pageOffset?: number; progress: number; spineItemId: string; textQuote: string }) => void;
  onPagePresentationChange?: (pageKind: "image" | "prose") => void;
  onSelectionChange?: (selection: {
    cfiRange: string;
    isReleased?: boolean;
    sentenceContext?: string;
    spineItemId: string;
    text: string;
  }) => void;
  onTocChange?: (toc: TocItem[]) => void;
};

export type ActiveTtsSegment = {
  cfi?: string;
  endOffset?: number;
  locatorText?: string;
  spineItemId: string;
  startOffset?: number;
  text: string;
};

export type RuntimeRenderHandle = {
  applyPreferences(preferences: Partial<ReaderPreferences>): Promise<void>;
  destroy(): void;
  findCfiFromTextQuote(textQuote: string): Promise<string | null>;
  getCurrentLocation?(): Promise<{ cfi: string; pageIndex?: number; pageOffset?: number; progress: number; spineItemId: string; textQuote: string } | null>;
  getViewportLocationSnapshot?(): { pageIndex?: number; pageOffset?: number };
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
const sentenceContextSelector = `${ttsBlockSelector}, div, section, article, h1, h2, h3, h4, h5, h6`;
const readerImagePageClassName = "reader-image-page";
const sentenceTerminatorPattern = /[.!?。！？]/;
const paginatedWheelThreshold = 80;
const paginatedWheelCooldownMs = 420;
const paginatedWheelResetMs = 180;

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

export function buildTocItems(items: NavItem[]): TocItem[] {
  return items.map((item) => ({
    children: item.subitems?.length ? buildTocItems(item.subitems) : [],
    id: item.id || item.href || item.label,
    label: item.label,
    target: item.href || item.id,
  }));
}

function sameActiveTtsSegment(left: ActiveTtsSegment | null, right: ActiveTtsSegment | null) {
  return left?.cfi === right?.cfi && left?.spineItemId === right?.spineItemId && left?.text === right?.text;
}

function normalizeSegmentText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function clampOffset(value: number, max: number) {
  return Math.max(0, Math.min(value, max));
}

function isNodeLike(value: unknown): value is Node {
  return Boolean(value && typeof value === "object" && "nodeType" in value);
}

function isElementNode(node: unknown): node is Element {
  return isNodeLike(node) && node.nodeType === Node.ELEMENT_NODE;
}

function isTextNode(node: unknown): node is Text {
  return isNodeLike(node) && node.nodeType === Node.TEXT_NODE;
}

function getBlockCfi(contents: Contents, element: HTMLElement) {
  const elementRange = element.ownerDocument.createRange();
  elementRange.selectNodeContents(element);

  try {
    return contents.cfiFromRange(elementRange);
  } catch {
    // Fall back to node-based targeting below.
  }

  try {
    return contents.cfiFromNode(element);
  } catch {
    const firstTextNode = findFirstTextNode(element);
    if (firstTextNode) {
      try {
        return contents.cfiFromNode(firstTextNode);
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

function findFirstTextNode(root: Node) {
  const ownerDocument = root.nodeType === Node.DOCUMENT_NODE ? (root as Document) : root.ownerDocument;
  if (!ownerDocument) {
    return null;
  }

  const walker = ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nextNode = walker.nextNode();
  return isTextNode(nextNode) ? nextNode : null;
}

function isContentEditableElement(node: Element | null) {
  return Boolean(node && "isContentEditable" in node && (node as HTMLElement).isContentEditable);
}

function getSentenceContextElement(node: Node | null) {
  const element = isElementNode(node) ? node : node?.parentElement ?? null;

  return (
    getNearestTtsBlockElement(node) ??
    element?.closest<HTMLElement>(sentenceContextSelector) ??
    element ??
    null
  );
}

function findSentenceStart(text: string, index: number) {
  let cursor = clampOffset(index, text.length);

  while (cursor > 0) {
    if (sentenceTerminatorPattern.test(text[cursor - 1] ?? "")) {
      break;
    }

    cursor -= 1;
  }

  while (cursor < text.length && /\s/.test(text[cursor] ?? "")) {
    cursor += 1;
  }

  return cursor;
}

function findSentenceEnd(text: string, index: number) {
  let cursor = clampOffset(index, text.length);
  let boundaryCursor = cursor;

  while (boundaryCursor > 0 && /["'”’)\]\s]/.test(text[boundaryCursor - 1] ?? "")) {
    boundaryCursor -= 1;
  }

  if (boundaryCursor > 0 && sentenceTerminatorPattern.test(text[boundaryCursor - 1] ?? "")) {
    return cursor;
  }

  while (cursor < text.length) {
    if (sentenceTerminatorPattern.test(text[cursor] ?? "")) {
      cursor += 1;

      while (cursor < text.length && /["'”’)\]\s]/.test(text[cursor] ?? "")) {
        cursor += 1;
      }

      return cursor;
    }

    cursor += 1;
  }

  return text.length;
}

export function extractSentenceContextFromRange(range: Range) {
  const selectionText = normalizeSegmentText(range.toString());
  if (!selectionText) {
    return "";
  }

  const root = getSentenceContextElement(range.commonAncestorContainer ?? range.startContainer);
  if (!root) {
    return selectionText;
  }

  const rawText = root.textContent ?? "";
  if (!rawText.trim()) {
    return selectionText;
  }

  try {
    const doc = root.ownerDocument;
    const startRange = doc.createRange();
    startRange.selectNodeContents(root);
    startRange.setEnd(range.startContainer, range.startOffset);

    const endRange = doc.createRange();
    endRange.selectNodeContents(root);
    endRange.setEnd(range.endContainer, range.endOffset);

    const start = findSentenceStart(rawText, startRange.toString().length);
    const end = findSentenceEnd(rawText, endRange.toString().length);

    return normalizeSegmentText(rawText.slice(start, end)) || normalizeSegmentText(rawText) || selectionText;
  } catch {
    return normalizeSegmentText(rawText) || selectionText;
  }
}

export function getPagePresentationKind(document: Document) {
  const body = document.body;
  if (!body) {
    return "prose" as const;
  }

  const bodyText = normalizeSegmentText(body.innerText || body.textContent || "");
  const mediaCount = body.querySelectorAll("img, svg, picture").length;
  const proseBlocks = Array.from(body.querySelectorAll("p, li, blockquote")).filter((block) => {
    const text = normalizeSegmentText(block.textContent || "");
    return text.length >= 80;
  }).length;

  if (mediaCount > 0 && (proseBlocks === 0 || bodyText.length < 240)) {
    return "image" as const;
  }

  return "prose" as const;
}

function getPaginatedContainer(root: ParentNode | null) {
  return root?.querySelector<HTMLElement>(".epub-container") ?? null;
}

function getNavigationTargetFragment(target: string) {
  const hashIndex = target.indexOf("#");
  if (hashIndex < 0 || hashIndex === target.length - 1) {
    return "";
  }

  try {
    return decodeURIComponent(target.slice(hashIndex + 1));
  } catch {
    return target.slice(hashIndex + 1);
  }
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

export async function waitForLayoutFrame(ownerDocument: Document | null = globalThis.document ?? null) {
  await new Promise<void>((resolve) => {
    const isHidden =
      ownerDocument?.visibilityState === "hidden" ||
      ownerDocument?.hidden === true;

    if (!isHidden && typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

async function waitForPaginatedContainerReady(root: ParentNode, maxFrames = 8) {
  for (let attempt = 0; attempt < maxFrames; attempt += 1) {
    const container = getPaginatedContainer(root);
    if (container && container.clientWidth > 0) {
      return container;
    }

    await waitForLayoutFrame(root.ownerDocument);
  }

  return getPaginatedContainer(root);
}

async function waitForSettledPaginatedContainer(root: ParentNode, expectedClientWidth = 0, maxFrames = 16) {
  let previousSignature = "";
  let stableFrames = 0;
  const minimumClientWidth = expectedClientWidth > 0 ? expectedClientWidth * 0.9 : 1;

  for (let attempt = 0; attempt < maxFrames; attempt += 1) {
    const container = getPaginatedContainer(root);
    if (container && container.clientWidth >= minimumClientWidth) {
      const signature = `${container.clientWidth}:${container.scrollWidth}`;
      if (signature === previousSignature) {
        stableFrames += 1;
      } else {
        previousSignature = signature;
        stableFrames = 0;
      }

      if (stableFrames >= 1) {
        return container;
      }
    }

    await waitForLayoutFrame(root.ownerDocument);
  }

  return getPaginatedContainer(root);
}

function readPaginatedLastPageIndex(container: HTMLElement | null) {
  if (!container || container.clientWidth <= 0) {
    return 0;
  }

  return Math.max(0, Math.ceil(container.scrollWidth / container.clientWidth) - 1);
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

  const element = isElementNode(node) ? node : node.parentElement;
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

export function findTtsSegmentTextRange(root: HTMLElement, text: string, startOffset?: number, endOffset?: number) {
  const normalizedSegment = normalizeSegmentText(text);
  if (!normalizedSegment) {
    return null;
  }

  const textNodes: Text[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();
  while (currentNode) {
    if (isTextNode(currentNode) && currentNode.nodeValue) {
      textNodes.push(currentNode);
    }
    currentNode = walker.nextNode();
  }

  if (!textNodes.length) {
    return null;
  }

  const positions: Array<{ endOffset: number; node: Text; startOffset: number }> = [];
  let normalizedText = "";
  let lastWasWhitespace = true;

  for (const textNode of textNodes) {
    const rawText = textNode.nodeValue ?? "";
    for (let index = 0; index < rawText.length; index += 1) {
      const character = rawText[index] ?? "";
      if (/\s/u.test(character)) {
        if (!lastWasWhitespace && normalizedText.length > 0) {
          normalizedText += " ";
          positions.push({
            endOffset: index + 1,
            node: textNode,
            startOffset: index,
          });
          lastWasWhitespace = true;
        }
        continue;
      }

      normalizedText += character;
      positions.push({
        endOffset: index + 1,
        node: textNode,
        startOffset: index,
      });
      lastWasWhitespace = false;
    }
  }

  let startIndex = -1;
  let endIndex = -1;

  if (typeof startOffset === "number" && typeof endOffset === "number" && endOffset > startOffset && positions.length) {
    startIndex = clampOffset(startOffset, positions.length - 1);
    endIndex = clampOffset(endOffset - 1, positions.length - 1);
    endIndex = Math.max(startIndex, endIndex);
  }

  if (startIndex < 0 || endIndex < 0) {
    const matchIndex = normalizedText.indexOf(normalizedSegment);
    if (matchIndex < 0) {
      return null;
    }

    startIndex = matchIndex;
    endIndex = matchIndex + normalizedSegment.length - 1;
  }

  const start = positions[startIndex];
  const end = positions[endIndex];
  if (!start || !end) {
    return null;
  }

  const range = root.ownerDocument.createRange();
  range.setStart(start.node, start.startOffset);
  range.setEnd(end.node, end.endOffset);
  return range;
}

export const epubViewportRuntime: EpubViewportRuntime = {
  async render({
    bookId,
    element,
    flow = "scrolled",
    initialCfi,
    initialPageIndex,
    initialPageOffset,
    initialPreferences,
    onRelocated,
    onPagePresentationChange,
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
      ...initialPreferences,
      readingMode: flow,
    };
    let preferredPaginatedRestore:
      | {
          cfi: string;
          pageIndex?: number;
          pageOffset?: number;
        }
      | null = flow === "paginated" && initialCfi
      ? {
          cfi: initialCfi,
          pageIndex: initialPageIndex,
          pageOffset: initialPageOffset,
        }
      : null;
    let activeTtsSegment: ActiveTtsSegment | null = null;
    let activeTtsElement: HTMLElement | null = null;
    let pointerSelecting = false;
    let restoreReadingSurfaceFocusOnRender = false;
    let pendingSelection:
      | {
          cfiRange: string;
          isReleased?: boolean;
          sentenceContext?: string;
          spineItemId: string;
          text: string;
        }
      | null = null;
    const selectionDocumentCleanups = new Map<Document, () => void>();
    let paginatedWheelDelta = 0;
    let paginatedWheelTurnInFlight = false;
    let lastPaginatedWheelTurnAt = 0;
    let lastPaginatedWheelDirection = 0;
    let paginatedWheelResetTimer: ReturnType<typeof setTimeout> | null = null;

    const resetPaginatedWheelDelta = () => {
      paginatedWheelDelta = 0;
      if (paginatedWheelResetTimer) {
        clearTimeout(paginatedWheelResetTimer);
        paginatedWheelResetTimer = null;
      }
    };

    const queuePaginatedWheelTurn = (deltaY: number) => {
      paginatedWheelDelta += deltaY;

      if (paginatedWheelResetTimer) {
        clearTimeout(paginatedWheelResetTimer);
      }

      paginatedWheelResetTimer = setTimeout(() => {
        paginatedWheelDelta = 0;
        paginatedWheelResetTimer = null;
      }, paginatedWheelResetMs);

      const nextDirection = paginatedWheelDelta > 0 ? 1 : -1;
      const now = Date.now();
      if (
        paginatedWheelTurnInFlight ||
        (now - lastPaginatedWheelTurnAt < paginatedWheelCooldownMs && nextDirection === lastPaginatedWheelDirection) ||
        Math.abs(paginatedWheelDelta) < paginatedWheelThreshold
      ) {
        return;
      }

      resetPaginatedWheelDelta();
      lastPaginatedWheelTurnAt = now;
      lastPaginatedWheelDirection = nextDirection;
      paginatedWheelTurnInFlight = true;

      void (nextDirection > 0 ? goToNextRenditionLocation() : goToPreviousRenditionLocation()).finally(() => {
        paginatedWheelTurnInFlight = false;
      });
    };

    const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim();
    const syncCurrentContents = () => {
      const contents = rendition.getContents();
      const nextContents = Array.isArray(contents) ? contents[0] : contents;

      if (nextContents) {
        currentContents = nextContents;
        attachSelectionLifecycle(nextContents);
        syncPagePresentation(nextContents);
        void applyActiveTtsSegment(activeTtsSegment);
      }
    };

    const syncPagePresentation = (contents: Contents) => {
      const pageKind = getPagePresentationKind(contents.document);
      element.dataset.pageKind = pageKind;
      onPagePresentationChange?.(pageKind);
      contents.document.body.classList.toggle(readerImagePageClassName, pageKind === "image");
    };

    const isReadingSurfaceKeyboardFocused = (contents: Contents | null) => {
      if (!contents) {
        return false;
      }

      const frameElement = contents.window.frameElement;
      if (!(frameElement instanceof HTMLElement)) {
        return false;
      }

      const ownerDocument = frameElement.ownerDocument;
      const innerActiveElement = contents.document.activeElement;
      return ownerDocument.activeElement === frameElement && innerActiveElement === contents.document.body;
    };

    const restoreReadingSurfaceFocus = async (contents: Contents) => {
      await waitForLayoutFrame(contents.document);

      const frameElement = contents.window.frameElement;
      const body = contents.document.body;
      if (!(frameElement instanceof HTMLElement) || !body.isConnected) {
        return;
      }

      if (!body.hasAttribute("tabindex")) {
        body.tabIndex = -1;
      }

      frameElement.focus();
      contents.window.focus();
      body.focus();
    };

    const clearActiveTtsSegment = () => {
      const wrappedElement = activeTtsElement;
      if (wrappedElement?.tagName === "SPAN" && wrappedElement.classList.contains("reader-tts-active-segment")) {
        const parent = wrappedElement.parentNode;
        if (parent) {
          while (wrappedElement.firstChild) {
            parent.insertBefore(wrappedElement.firstChild, wrappedElement);
          }
          parent.removeChild(wrappedElement);
          parent.normalize?.();
        }
      }
      wrappedElement?.classList.remove("reader-tts-active-segment");
      activeTtsElement = null;
    };

    const findSegmentElement = async (contents: Contents, segment: ActiveTtsSegment) => {
      if (segment.cfi) {
        try {
          const range = contents.range(segment.cfi);
          const block = getNearestTtsBlockElement(range?.startContainer ?? null);
          if (block && contents.document.body.contains(block)) {
            return block;
          }
        } catch {
          // Fall back to book-level text targeting when the stored CFI cannot be resolved in the active contents.
        }

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

      if (segment.locatorText) {
        const block = findTtsBlockElementByText(contents.document.body, segment.locatorText);
        if (block) {
          return block;
        }
      }

      return findTtsBlockElementByText(contents.document.body, segment.text);
    };

    let activeTtsLookupToken = 0;
    let activeTtsRetryTimer: ReturnType<typeof setTimeout> | null = null;

    const clearActiveTtsRetry = () => {
      if (activeTtsRetryTimer) {
        clearTimeout(activeTtsRetryTimer);
        activeTtsRetryTimer = null;
      }
    };

    const applyActiveTtsSegment = async (segment: ActiveTtsSegment | null, attempt = 0) => {
      activeTtsSegment = segment;
      clearActiveTtsRetry();
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
        if (attempt < 4 && sameActiveTtsSegment(activeTtsSegment, segment)) {
          activeTtsRetryTimer = setTimeout(() => {
            void applyActiveTtsSegment(segment, attempt + 1);
          }, 120);
        }
        return;
      }

      const view = currentContents.window;
      const preciseRange = findTtsSegmentTextRange(nextElement, segment.text, segment.startOffset, segment.endOffset);
      if (preciseRange) {
        const wrapper = nextElement.ownerDocument.createElement("span");
        wrapper.className = "reader-tts-active-segment";
        const contents = preciseRange.extractContents();
        wrapper.append(contents);
        preciseRange.insertNode(wrapper);
        activeTtsElement = wrapper;
      } else {
        nextElement.classList.add("reader-tts-active-segment");
        activeTtsElement = nextElement;
      }

      const preciseRect = preciseRange
        ? Array.from(preciseRange.getClientRects()).find((rect) => rect.width > 0 || rect.height > 0) ??
          preciseRange.getBoundingClientRect()
        : null;
      const revealTarget = activeTtsElement ?? nextElement;
      const rect = preciseRect ?? revealTarget.getBoundingClientRect();
      const viewportHeight = view.innerHeight || revealTarget.ownerDocument.documentElement.clientHeight || 0;
      const viewportWidth = view.innerWidth || revealTarget.ownerDocument.documentElement.clientWidth || 0;
      const shouldRevealPaginatedTarget =
        activePreferences.readingMode === "paginated" && viewportWidth > 0 && (rect.left < 0 || rect.right > viewportWidth);
      const shouldRevealScrolledTarget =
        activePreferences.readingMode !== "paginated" &&
        shouldAutoScrollTtsSegment(activePreferences.readingMode, rect, viewportHeight);

      if (shouldRevealPaginatedTarget || shouldRevealScrolledTarget) {
        revealTarget.scrollIntoView?.({
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

    const toPreferredStoredLocation = async (location: Location, cfi: string) => {
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

      const handlePaginatedArrowKey = (event: KeyboardEvent) => {
        if (activePreferences.readingMode !== "paginated") {
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          void goToNextRenditionLocation();
          return;
        }

        if (event.key !== "ArrowLeft") {
          return;
        }

        event.preventDefault();
        void goToPreviousRenditionLocation();
      };

      const handlePaginatedWheel = (event: WheelEvent) => {
        if (activePreferences.readingMode !== "paginated") {
          return;
        }

        if (event.defaultPrevented || event.ctrlKey || event.metaKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
          return;
        }

        const target = event.target;
        const targetElement = isElementNode(target) ? target : null;
        const tagName = targetElement?.tagName?.toLowerCase();
        if (tagName === "input" || tagName === "textarea" || tagName === "select" || isContentEditableElement(targetElement)) {
          return;
        }

        event.preventDefault();
        queuePaginatedWheelTurn(event.deltaY);
      };

      doc.addEventListener("mousedown", handlePointerDown, true);
      doc.addEventListener("mouseup", handlePointerUp, true);
      doc.addEventListener("touchstart", handlePointerDown, true);
      doc.addEventListener("touchend", handlePointerUp, true);
      doc.addEventListener("keydown", handlePaginatedArrowKey, true);
      doc.addEventListener("wheel", handlePaginatedWheel, {
        capture: true,
        passive: false,
      });

      selectionDocumentCleanups.set(doc, () => {
        doc.removeEventListener("mousedown", handlePointerDown, true);
        doc.removeEventListener("mouseup", handlePointerUp, true);
        doc.removeEventListener("touchstart", handlePointerDown, true);
        doc.removeEventListener("touchend", handlePointerUp, true);
        doc.removeEventListener("keydown", handlePaginatedArrowKey, true);
        doc.removeEventListener("wheel", handlePaginatedWheel, true);
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
          const cfi = getBlockCfi(contents, candidate);

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
        sentenceContext: range ? extractSentenceContextFromRange(range) : text,
        spineItemId: currentSpineItemId,
        text,
      };

      if (pointerSelecting) {
        pendingSelection = selection;
      }

      onSelectionChange?.(selection);
    };

    const handleRelocated = async (location: Location) => {
      const preferredRestore =
        activePreferences.readingMode === "paginated" ? preferredPaginatedRestore : null;
      if (preferredRestore) {
        await settlePaginatedPosition(
          activePreferences.readingMode,
          preferredRestore.pageOffset,
          preferredRestore.pageIndex,
        );
      }
      const storedLocation = preferredRestore
        ? await toPreferredStoredLocation(location, preferredRestore.cfi)
        : await toStoredLocation(location);
      currentTarget = storedLocation.cfi;
      currentSpineItemId = storedLocation.spineItemId;
      onRelocated?.(storedLocation);
      if (preferredRestore) {
        preferredPaginatedRestore = null;
      }
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

    const settlePaginatedPosition = async (
      readingMode: ReadingMode,
      pageOffset?: number,
      pageIndex?: number,
    ) => {
      const initialContainer = await waitForPaginatedContainerReady(element);
      restorePaginatedPagePosition(readingMode, initialContainer, pageOffset, pageIndex);
      await waitForLayoutFrame(element.ownerDocument);
      const settledContainer = await waitForPaginatedContainerReady(element);
      restorePaginatedPagePosition(readingMode, settledContainer, pageOffset, pageIndex);
    };

    const settleDisplayedPaginatedLocation = async (readingMode: ReadingMode) => {
      if (readingMode !== "paginated") {
        return;
      }

      const container = await waitForPaginatedContainerReady(element);
      const displayedPageIndex = readPaginatedPageIndex(readingMode, container);
      const displayedPageOffset = readPaginatedPageOffset(readingMode, container);
      restorePaginatedPagePosition(readingMode, container, displayedPageOffset, displayedPageIndex);
    };

    const resolveNavigationTarget = async (target: string) => {
      const fragment = getNavigationTargetFragment(target);
      if (!fragment || !currentContents) {
        return target;
      }

      await waitForLayoutFrame(currentContents.document);
      const fragmentElement = currentContents.document.getElementById(fragment);
      if (!fragmentElement) {
        return target;
      }

      try {
        return currentContents.cfiFromNode(fragmentElement);
      } catch {
        return target;
      }
    };

    const settlePaginatedSectionBoundary = async (
      readingMode: ReadingMode,
      boundary: "start" | "end",
      expectedClientWidth: number,
    ) => {
      if (readingMode !== "paginated") {
        return;
      }

      const initialContainer = await waitForSettledPaginatedContainer(element, expectedClientWidth);
      restorePaginatedPagePosition(
        readingMode,
        initialContainer,
        boundary === "start" ? 0 : undefined,
        boundary === "start" ? 0 : readPaginatedLastPageIndex(initialContainer),
      );
      await waitForLayoutFrame(element.ownerDocument);
      const settledContainer = await waitForSettledPaginatedContainer(element, expectedClientWidth);
      restorePaginatedPagePosition(
        readingMode,
        settledContainer,
        boundary === "start" ? 0 : undefined,
        boundary === "start" ? 0 : readPaginatedLastPageIndex(settledContainer),
      );
    };

    const goToNextRenditionLocation = async () => {
      const previousContents = currentContents;
      const previousSpineItemId = currentSpineItemId;
      const previousPaginatedClientWidth = getPaginatedContainer(element)?.clientWidth ?? 0;
      restoreReadingSurfaceFocusOnRender = isReadingSurfaceKeyboardFocused(previousContents);
      await rendition.next();
      syncCurrentContents();
      if (currentContents === previousContents) {
        restoreReadingSurfaceFocusOnRender = false;
      }
      await syncDisplayedLocation();
      const movedAcrossSpine =
        activePreferences.readingMode === "paginated" &&
        Boolean(previousSpineItemId) &&
        Boolean(currentSpineItemId) &&
        currentSpineItemId !== previousSpineItemId;

      if (movedAcrossSpine) {
        await settlePaginatedSectionBoundary(activePreferences.readingMode, "start", previousPaginatedClientWidth);
        await syncDisplayedLocation();
        return;
      }

      await settleDisplayedPaginatedLocation(activePreferences.readingMode);
      await syncDisplayedLocation();
    };

    const goToPreviousRenditionLocation = async () => {
      const previousContents = currentContents;
      const previousSpineItemId = currentSpineItemId;
      const previousPaginatedClientWidth = getPaginatedContainer(element)?.clientWidth ?? 0;
      restoreReadingSurfaceFocusOnRender = isReadingSurfaceKeyboardFocused(previousContents);
      await rendition.prev();
      syncCurrentContents();
      if (currentContents === previousContents) {
        restoreReadingSurfaceFocusOnRender = false;
      }
      await syncDisplayedLocation();
      const movedAcrossSpine =
        activePreferences.readingMode === "paginated" &&
        Boolean(previousSpineItemId) &&
        Boolean(currentSpineItemId) &&
        currentSpineItemId !== previousSpineItemId;

      if (movedAcrossSpine) {
        await settlePaginatedSectionBoundary(activePreferences.readingMode, "end", previousPaginatedClientWidth);
        await syncDisplayedLocation();
        return;
      }

      await settleDisplayedPaginatedLocation(activePreferences.readingMode);
      await syncDisplayedLocation();
    };

    const handleRendered = (_section: unknown, contents: Contents) => {
      currentContents = contents;
      attachSelectionLifecycle(contents);
      syncPagePresentation(contents);
      void applyActiveTtsSegment(activeTtsSegment);
      if (restoreReadingSurfaceFocusOnRender) {
        restoreReadingSurfaceFocusOnRender = false;
        void restoreReadingSurfaceFocus(contents);
      }
    };

    rendition.on("selected", handleSelection);
    rendition.on("relocated", handleRelocated);
    rendition.on("rendered", handleRendered);
    rendition.themes.default(buildReaderTheme(activePreferences));

    const handleHostPaginatedWheel = (event: WheelEvent) => {
      if (activePreferences.readingMode !== "paginated") {
        return;
      }

      const target = event.target;
      const targetElement = isElementNode(target) ? target : null;
      if (!targetElement?.closest(".epub-container")) {
        return;
      }

      const currentDocument = currentContents?.document ?? null;
      if (currentDocument && targetElement.ownerDocument !== currentDocument) {
        return;
      }

      if (event.defaultPrevented || event.ctrlKey || event.metaKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }

      event.preventDefault();
      queuePaginatedWheelTurn(event.deltaY);
    };

    element.addEventListener("wheel", handleHostPaginatedWheel, {
      capture: true,
      passive: false,
    });

    const navigation = await book.loaded.navigation;
    onTocChange?.(buildTocItems(navigation.toc));
    await rendition.display(initialCfi);
    syncCurrentContents();
    if (initialCfi) {
      const resolvedInitialTarget = await resolveNavigationTarget(initialCfi);
      if (resolvedInitialTarget !== initialCfi) {
        currentTarget = resolvedInitialTarget;
        if (flow === "paginated") {
          preferredPaginatedRestore = {
            cfi: resolvedInitialTarget,
            pageIndex: initialPageIndex,
            pageOffset: initialPageOffset,
          };
        }
        await rendition.display(resolvedInitialTarget);
        syncCurrentContents();
      }
    }
    await settlePaginatedPosition(flow, initialPageOffset, initialPageIndex);
    await syncDisplayedLocation();

    return {
      async applyPreferences(preferences) {
        const preservedPageIndex = readPaginatedPageIndex(activePreferences.readingMode, getPaginatedContainer(element));
        const preservedPageOffset = readPaginatedPageOffset(activePreferences.readingMode, getPaginatedContainer(element));
        activePreferences = {
          ...activePreferences,
          ...preferences,
        };
        rendition.themes.default(buildReaderTheme(activePreferences));
        await settlePaginatedPosition(activePreferences.readingMode, preservedPageOffset, preservedPageIndex);
        await syncDisplayedLocation();
      },
      destroy() {
        resetPaginatedWheelDelta();
        clearActiveTtsRetry();
        clearActiveTtsSegment();
        delete element.dataset.pageKind;
        onPagePresentationChange?.("prose");
        selectionDocumentCleanups.forEach((cleanup) => cleanup());
        selectionDocumentCleanups.clear();
        element.removeEventListener("wheel", handleHostPaginatedWheel, true);
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
          if (activePreferences.readingMode === "paginated" && preferredPaginatedRestore) {
            return toPreferredStoredLocation(displayedLocation, preferredPaginatedRestore.cfi);
          }

          if (activePreferences.readingMode === "paginated" && currentTarget) {
            return toPreferredStoredLocation(displayedLocation, currentTarget);
          }

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
      getViewportLocationSnapshot() {
        return {
          pageIndex: readPaginatedPageIndex(activePreferences.readingMode, getPaginatedContainer(element)),
          pageOffset: readPaginatedPageOffset(activePreferences.readingMode, getPaginatedContainer(element)),
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
        preferredPaginatedRestore =
          activePreferences.readingMode === "paginated"
            ? {
                cfi: target,
              }
            : null;
        await rendition.display(target);
        syncCurrentContents();
        const resolvedTarget = await resolveNavigationTarget(target);
        if (resolvedTarget !== target) {
          currentTarget = resolvedTarget;
          preferredPaginatedRestore =
            activePreferences.readingMode === "paginated"
              ? {
                  cfi: resolvedTarget,
                }
              : null;
          await rendition.display(resolvedTarget);
          syncCurrentContents();
        }
        await settleDisplayedPaginatedLocation(activePreferences.readingMode);
        await syncDisplayedLocation();
      },
      async next() {
        await goToNextRenditionLocation();
      },
      async prev() {
        await goToPreviousRenditionLocation();
      },
      async setActiveTtsSegment(segment) {
        await applyActiveTtsSegment(segment);
      },
      async setFlow(nextFlow) {
        const preservedPageIndex = readPaginatedPageIndex(activePreferences.readingMode, getPaginatedContainer(element));
        const preservedPageOffset = readPaginatedPageOffset(activePreferences.readingMode, getPaginatedContainer(element));
        activePreferences = {
          ...activePreferences,
          readingMode: nextFlow,
        };
        preferredPaginatedRestore =
          nextFlow === "paginated" && currentTarget
            ? {
                cfi: currentTarget,
                pageIndex: preservedPageIndex,
                pageOffset: preservedPageOffset,
              }
            : null;
        rendition.flow(toEpubFlow(nextFlow));
        rendition.spread(nextFlow === "paginated" ? "none" : "auto");
        await rendition.display(currentTarget || undefined);
        syncCurrentContents();
        await settlePaginatedPosition(nextFlow, preservedPageOffset, preservedPageIndex);
        await syncDisplayedLocation();
      },
    };
  },
};
