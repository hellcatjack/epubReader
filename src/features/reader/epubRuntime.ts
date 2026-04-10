import ePub, { type Contents, type Location, type NavItem } from "epubjs";
import { loadStoredBookFile } from "../bookshelf/bookFileRepository";
import type { TocItem } from "../../lib/types/books";
import type { ReadingMode } from "../../lib/types/settings";
import { applyReaderThemeToRendition, defaultReaderPreferences, type ReaderPreferences, toEpubFlow } from "./readerPreferences";
import type { ReaderSelectionRect } from "./selectionBridge";
import { findTocPathBySpineItemId, getTocTarget, getTocTargetSpineItemId } from "./tocTree";

export type RuntimeRenderArgs = {
  bookId: string;
  element: HTMLElement;
  flow?: ReadingMode;
  initialCfi?: string;
  initialPageIndex?: number;
  initialPageOffset?: number;
  initialScrollTop?: number;
  initialPreferences?: Partial<ReaderPreferences>;
  onRelocated?: (location: {
    cfi: string;
    pageIndex?: number;
    pageOffset?: number;
    progress: number;
    sectionPath?: string[];
    scrollTop?: number;
    spineItemId: string;
    textQuote: string;
  }) => void;
  onPagePresentationChange?: (pageKind: "image" | "prose") => void;
  onSelectionChange?: (selection: {
    cfiRange: string;
    isReleased?: boolean;
    selectionRect?: ReaderSelectionRect;
    sentenceContext?: string;
    spineItemId: string;
    text: string;
    ttsBlocks?: RuntimeTtsBlock[];
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

export type RuntimeTtsBlock = {
  cfi?: string;
  locatorText?: string;
  sourceEnd?: number;
  sourceStart?: number;
  spineItemId: string;
  tagName?: string;
  text: string;
};

export type TtsSentenceNoteMetrics = {
  activeRect: ReaderSelectionRect;
  readingRect: ReaderSelectionRect;
};

export type ScrolledResizeRestoreAnchor = {
  cfi?: string;
  offsetFromViewportTop: number;
  textQuote: string;
};

export type PaginatedResizeRestoreAnchor = {
  cfi?: string;
  offsetFromViewportLeft: number;
  textQuote: string;
};

export type RuntimeRenderHandle = {
  applyPreferences(preferences: Partial<ReaderPreferences>): Promise<void>;
  clearSelection?(): Promise<void>;
  destroy(): void;
  findCfiFromTextQuote(textQuote: string): Promise<string | null>;
  getCurrentSelection?(): Promise<
      | {
        cfiRange: string;
        isReleased: boolean;
        selectionRect?: ReaderSelectionRect;
        sentenceContext?: string;
        spineItemId: string;
        text: string;
        ttsBlocks?: RuntimeTtsBlock[];
      }
    | null
  >;
  getCurrentSelectionSnapshot?():
    | {
        cfiRange: string;
        isReleased: boolean;
        selectionRect?: ReaderSelectionRect;
        sentenceContext?: string;
        spineItemId: string;
        text: string;
        ttsBlocks?: RuntimeTtsBlock[];
      }
    | null;
  getCurrentLocation?(): Promise<{
    cfi: string;
    pageIndex?: number;
    pageOffset?: number;
    progress: number;
    sectionPath?: string[];
    scrollTop?: number;
    spineItemId: string;
    textQuote: string;
  } | null>;
  getViewportLocationSnapshot?(): { pageIndex?: number; pageOffset?: number; scrollTop?: number };
  getTextFromCurrentLocation(): Promise<string>;
  getTtsBlocksFromCurrentSelection?(): Promise<RuntimeTtsBlock[]>;
  getTtsBlocksFromCurrentLocation?(): Promise<RuntimeTtsBlock[]>;
  getTtsBlocksFromSelectionStart?(cfiRange: string): Promise<RuntimeTtsBlock[]>;
  getTtsBlocksFromTarget?(target: string): Promise<RuntimeTtsBlock[]>;
  getTtsSentenceNoteMetrics?(): TtsSentenceNoteMetrics | null;
  goTo(target: string): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  setActiveTtsSegment(segment: ActiveTtsSegment | null): Promise<void>;
  setFlow(flow: ReadingMode): Promise<void>;
  setTtsPlaybackFollow?(enabled: boolean): Promise<void>;
};

export type EpubViewportRuntime = {
  render(args: RuntimeRenderArgs): Promise<RuntimeRenderHandle>;
};

const ttsBlockSelector = "p, li, blockquote, h1, h2, h3, h4, h5, h6";
const sentenceContextSelector = `${ttsBlockSelector}, div, section, article`;
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

function isTtsMarkerText(text: string) {
  return /^(?:\[\d+[a-z]?\]|\d+[a-z]?|\d+\s*:\s*\d+)$/iu.test(normalizeSegmentText(text));
}

function isTtsOmittableElement(element: Element) {
  const tagName = element.tagName.toLowerCase();
  const text = element.textContent ?? "";
  if (!isTtsMarkerText(text)) {
    return false;
  }

  if (tagName === "sup") {
    return true;
  }

  if (
    tagName === "a" &&
    element.parentElement?.tagName === "SUP" &&
    (/^#(?:f|x)/iu.test(element.getAttribute("href") ?? "") || /^(?:b|x)/iu.test(element.id))
  ) {
    return true;
  }

  if (tagName === "b" && /^v\d+$/iu.test(element.id)) {
    return true;
  }

  return false;
}

function isTtsHeadingElement(element: Element | null | undefined) {
  return /^h[1-6]$/i.test(element?.tagName ?? "");
}

function isWithinOmittableTtsElement(node: Node, root: Node) {
  let element = isElementNode(node) ? node : node.parentElement;
  while (element) {
    if (isTtsOmittableElement(element)) {
      return true;
    }

    if (element === root) {
      break;
    }

    element = element.parentElement;
  }

  return false;
}

type TtsTextPosition = {
  endOffset: number;
  node: Text;
  startOffset: number;
};

function collectNormalizedTtsText(root: Node) {
  const ownerDocument = root.nodeType === Node.DOCUMENT_NODE ? (root as Document) : root.ownerDocument;
  if (!ownerDocument) {
    return {
      positions: [] as TtsTextPosition[],
      text: "",
    };
  }

  const positions: TtsTextPosition[] = [];
  const walker = ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();
  let text = "";
  let lastWasWhitespace = true;

  while (currentNode) {
    if (isTextNode(currentNode) && currentNode.nodeValue && !isWithinOmittableTtsElement(currentNode, root)) {
      const rawText = currentNode.nodeValue;
      for (let index = 0; index < rawText.length; index += 1) {
        const character = rawText[index] ?? "";
        if (/\s/u.test(character)) {
          if (!lastWasWhitespace && text.length > 0) {
            text += " ";
            positions.push({
              endOffset: index + 1,
              node: currentNode,
              startOffset: index,
            });
            lastWasWhitespace = true;
          }
          continue;
        }

        text += character;
        positions.push({
          endOffset: index + 1,
          node: currentNode,
          startOffset: index,
        });
        lastWasWhitespace = false;
      }
    }

    currentNode = walker.nextNode();
  }

  return {
    positions,
    text,
  };
}

export function extractTtsBlockText(root: Node) {
  return collectNormalizedTtsText(root).text;
}

export function createReaderSelectionSnapshotFromRange({
  contents,
  fallbackCfiRange = "",
  isReleased,
  range,
  sentenceContext,
  selectionRect,
  spineItemId,
  text,
  ttsBlocks,
}: {
  contents: Pick<Contents, "cfiFromRange">;
  fallbackCfiRange?: string;
  isReleased: boolean;
  range: Range;
  sentenceContext?: string;
  selectionRect?: ReaderSelectionRect;
  spineItemId: string;
  text?: string;
  ttsBlocks?: RuntimeTtsBlock[];
}) {
  const normalizedText = normalizeSegmentText(text ?? range.toString());
  if (!normalizedText) {
    return null;
  }

  let cfiRange = fallbackCfiRange;
  if (!cfiRange) {
    try {
      cfiRange = contents.cfiFromRange(range);
    } catch {
      cfiRange = "";
    }
  }

  return {
    cfiRange,
    isReleased,
    selectionRect,
    sentenceContext: sentenceContext ?? extractSentenceContextFromRange(range),
    spineItemId,
    text: normalizedText,
    ttsBlocks,
  };
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

export function captureScrolledResizeRestoreAnchor(
  contents: Pick<Contents, "cfiFromNode" | "cfiFromRange">,
  candidates: readonly HTMLElement[],
  viewport: { height: number; left: number; top: number; width: number },
) {
  const visibleIndex = findFirstVisibleTtsBlockIndex(candidates, viewport.width, viewport.height, viewport.top);
  if (visibleIndex < 0) {
    return null;
  }

  const anchorElement = candidates[visibleIndex];
  const cfi = getBlockCfi(contents as Contents, anchorElement);
  const anchorTop = anchorElement.getBoundingClientRect().top;
  const textQuote = extractTtsBlockText(anchorElement);
  if (!textQuote || !Number.isFinite(anchorTop)) {
    return null;
  }

  return {
    cfi,
    offsetFromViewportTop: anchorTop - viewport.top,
    textQuote,
  } satisfies ScrolledResizeRestoreAnchor;
}

export function capturePaginatedResizeRestoreAnchor(
  contents: Pick<Contents, "cfiFromNode" | "cfiFromRange">,
  candidates: readonly HTMLElement[],
  viewport: { height: number; left: number; top: number; width: number },
) {
  const visibleIndex = findMostCentralVisiblePaginatedTtsBlockIndex(
    candidates,
    viewport.width,
    viewport.height,
    viewport.left,
    viewport.top,
  );
  if (visibleIndex < 0) {
    return null;
  }

  const anchorElement = candidates[visibleIndex];
  const anchorText =
    findVisibleTextOffsetNearPoint(
      anchorElement,
      viewport.width,
      viewport.height,
      viewport.left + viewport.width / 2,
      viewport.top + viewport.height / 2,
      viewport.left,
      viewport.top,
    ) ??
    findFirstVisibleTextOffset(anchorElement, viewport.width, viewport.height, viewport.left, viewport.top);
  let cfi: string | undefined;
  let anchorLeft: number | undefined;

  if (anchorText) {
    const range = createCollapsedRange(anchorElement.ownerDocument, anchorText.node);
    range.setStart(anchorText.node, anchorText.offset);
    range.setEnd(anchorText.node, anchorText.offset);
    anchorLeft = readResizeAnchorLeft(range);

    try {
      cfi = contents.cfiFromRange(range);
    } catch {
      cfi = undefined;
    }
  }

  cfi ||= getBlockCfi(contents as Contents, anchorElement);
  anchorLeft ??= anchorElement.getBoundingClientRect().left;
  const textQuote = extractTtsBlockText(anchorElement);
  if (!textQuote || !Number.isFinite(anchorLeft)) {
    return null;
  }

  return {
    cfi,
    offsetFromViewportLeft: anchorLeft - viewport.left,
    textQuote,
  } satisfies PaginatedResizeRestoreAnchor;
}

function captureLeadingPaginatedVisibleCfi(
  contents: Pick<Contents, "cfiFromNode" | "cfiFromRange">,
  candidates: readonly HTMLElement[],
  viewport: { height: number; left: number; top: number; width: number },
) {
  const visibleIndex = findFirstVisiblePaginatedTtsBlockIndex(
    candidates,
    viewport.width,
    viewport.height,
    viewport.left,
    viewport.top,
  );
  if (visibleIndex < 0) {
    return "";
  }

  const anchorElement = candidates[visibleIndex];
  const firstVisibleText = findFirstVisibleTextOffset(
    anchorElement,
    viewport.width,
    viewport.height,
    viewport.left,
    viewport.top,
  );
  if (firstVisibleText) {
    const range = createCollapsedRange(anchorElement.ownerDocument, firstVisibleText.node);
    range.setStart(firstVisibleText.node, firstVisibleText.offset);
    range.setEnd(firstVisibleText.node, firstVisibleText.offset);
    try {
      return contents.cfiFromRange(range);
    } catch {
      return getBlockCfi(contents as Contents, anchorElement) ?? "";
    }
  }

  return getBlockCfi(contents as Contents, anchorElement) ?? "";
}

export function resolveScrolledResizeAnchorScrollTop(anchorTop: number, offsetFromViewportTop: number) {
  if (!Number.isFinite(anchorTop) || !Number.isFinite(offsetFromViewportTop)) {
    return undefined;
  }

  return Math.max(0, Math.round(anchorTop - offsetFromViewportTop));
}

export function resolvePaginatedResizeAnchorScrollLeft(anchorLeft: number, offsetFromViewportLeft: number) {
  if (!Number.isFinite(anchorLeft) || !Number.isFinite(offsetFromViewportLeft)) {
    return undefined;
  }

  return Math.max(0, Math.round(anchorLeft - offsetFromViewportLeft));
}

export function resolveScrolledResizeFallbackScrollTop(
  preservedScrollTop?: number,
  preservedScrollMax?: number,
  nextScrollMax?: number,
) {
  if (!(typeof preservedScrollTop === "number" && Number.isFinite(preservedScrollTop))) {
    return undefined;
  }

  if (
    typeof preservedScrollMax === "number" &&
    Number.isFinite(preservedScrollMax) &&
    preservedScrollMax > 0 &&
    typeof nextScrollMax === "number" &&
    Number.isFinite(nextScrollMax)
  ) {
    return Math.max(0, Math.round((preservedScrollTop / preservedScrollMax) * Math.max(0, nextScrollMax)));
  }

  return Math.max(0, Math.round(preservedScrollTop));
}

export function resolveScrolledContentsTop(localTop: number, _frameTop?: number, _containerTop?: number) {
  if (!Number.isFinite(localTop)) {
    return undefined;
  }

  // Scrolled-mode block rects are already expressed in the chapter document's
  // scroll coordinate space. Reapplying iframe/container offsets pulls the
  // restore anchor upward during host resize.
  return localTop;
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

function getVisibleRect(rect: DOMRect, viewportWidth: number, viewportHeight: number, viewportLeft = 0, viewportTop = 0) {
  const visibleLeft = Math.max(viewportLeft, rect.left);
  const visibleRight = Math.min(viewportLeft + viewportWidth, rect.right);
  const visibleTop = Math.max(viewportTop, rect.top);
  const visibleBottom = Math.min(viewportTop + viewportHeight, rect.bottom);

  return {
    height: visibleBottom - visibleTop,
    left: visibleLeft,
    top: visibleTop,
    width: visibleRight - visibleLeft,
  };
}

function toSelectionViewportRect(contents: Contents, range: Range): ReaderSelectionRect | undefined {
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) {
    return undefined;
  }

  const frameElement = isElementNode(contents.window.frameElement) ? contents.window.frameElement : null;
  const offsetLeft = frameElement?.getBoundingClientRect().left ?? 0;
  const offsetTop = frameElement?.getBoundingClientRect().top ?? 0;

  return {
    bottom: offsetTop + rect.bottom,
    height: rect.height,
    left: offsetLeft + rect.left,
    right: offsetLeft + rect.right,
    top: offsetTop + rect.top,
    width: rect.width,
  };
}

function getVisibleAreaWithinHost(frameRect: DOMRect, hostRect: DOMRect) {
  const visibleLeft = Math.max(hostRect.left, frameRect.left);
  const visibleRight = Math.min(hostRect.right, frameRect.right);
  const visibleTop = Math.max(hostRect.top, frameRect.top);
  const visibleBottom = Math.min(hostRect.bottom, frameRect.bottom);
  const width = visibleRight - visibleLeft;
  const height = visibleBottom - visibleTop;

  if (width <= 1 || height <= 1) {
    return 0;
  }

  return width * height;
}

export function findMostVisibleContentsIndex(contents: readonly Contents[], host: HTMLElement) {
  if (!contents.length) {
    return -1;
  }

  const hostRect = host.getBoundingClientRect();
  let bestIndex = 0;
  let bestArea = -1;

  contents.forEach((entry, index) => {
    const frameElement = entry.window.frameElement;
    if (!(frameElement instanceof HTMLElement)) {
      return;
    }

    const visibleArea = getVisibleAreaWithinHost(frameElement.getBoundingClientRect(), hostRect);
    if (visibleArea > bestArea) {
      bestArea = visibleArea;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function isVisibleTtsBlock(rect: DOMRect, viewportWidth: number, viewportHeight: number, viewportLeft = 0, viewportTop = 0) {
  const visibleRect = getVisibleRect(rect, viewportWidth, viewportHeight, viewportLeft, viewportTop);
  return visibleRect.width > 1 && visibleRect.height > 1;
}

export function findFirstVisibleTtsBlockIndex(
  blocks: readonly HTMLElement[],
  viewportWidth: number,
  viewportHeight: number,
  viewportTop = 0,
) {
  if (!blocks.length || viewportWidth <= 0 || viewportHeight <= 0) {
    return -1;
  }

  let bestIndex = -1;
  let bestTop = Number.POSITIVE_INFINITY;
  let bestLeft = Number.POSITIVE_INFINITY;

  blocks.forEach((block, index) => {
    const rect = block.getBoundingClientRect();
    const visibleRect = getVisibleRect(rect, viewportWidth, viewportHeight, 0, viewportTop);
    if (visibleRect.width <= 1 || visibleRect.height <= 1) {
      return;
    }

    if (
      bestIndex === -1 ||
      visibleRect.top < bestTop ||
      (visibleRect.top === bestTop && visibleRect.left < bestLeft)
    ) {
      bestIndex = index;
      bestTop = visibleRect.top;
      bestLeft = visibleRect.left;
    }
  });

  return bestIndex;
}

export function findFirstVisiblePaginatedTtsBlockIndex(
  blocks: readonly HTMLElement[],
  viewportWidth: number,
  viewportHeight: number,
  viewportLeft = 0,
  viewportTop = 0,
) {
  if (!blocks.length || viewportWidth <= 0 || viewportHeight <= 0) {
    return -1;
  }

  let bestIndex = -1;
  let bestLeft = Number.POSITIVE_INFINITY;
  let bestTop = Number.POSITIVE_INFINITY;

  blocks.forEach((block, index) => {
    const rect = block.getBoundingClientRect();
    const visibleRect = getVisibleRect(rect, viewportWidth, viewportHeight, viewportLeft, viewportTop);
    if (visibleRect.width <= 1 || visibleRect.height <= 1) {
      return;
    }

    if (
      bestIndex === -1 ||
      visibleRect.left < bestLeft ||
      (visibleRect.left === bestLeft && visibleRect.top < bestTop)
    ) {
      bestIndex = index;
      bestLeft = visibleRect.left;
      bestTop = visibleRect.top;
    }
  });

  return bestIndex;
}

function findMostCentralVisiblePaginatedTtsBlockIndex(
  blocks: readonly HTMLElement[],
  viewportWidth: number,
  viewportHeight: number,
  viewportLeft = 0,
  viewportTop = 0,
) {
  if (!blocks.length || viewportWidth <= 0 || viewportHeight <= 0) {
    return -1;
  }

  const targetLeft = viewportLeft + viewportWidth / 2;
  const targetTop = viewportTop + viewportHeight / 2;
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestLeft = Number.POSITIVE_INFINITY;
  let bestTop = Number.POSITIVE_INFINITY;

  blocks.forEach((block, index) => {
    const rect = block.getBoundingClientRect();
    const visibleRect = getVisibleRect(rect, viewportWidth, viewportHeight, viewportLeft, viewportTop);
    if (visibleRect.width <= 1 || visibleRect.height <= 1) {
      return;
    }

    const centerLeft = visibleRect.left + visibleRect.width / 2;
    const centerTop = visibleRect.top + visibleRect.height / 2;
    const distance = Math.abs(centerLeft - targetLeft) + Math.abs(centerTop - targetTop) * 0.35;

    if (
      bestIndex === -1 ||
      distance < bestDistance ||
      (distance === bestDistance && (centerLeft < bestLeft || (centerLeft === bestLeft && centerTop < bestTop)))
    ) {
      bestIndex = index;
      bestDistance = distance;
      bestLeft = centerLeft;
      bestTop = centerTop;
    }
  });

  return bestIndex;
}

export function findVisibleLocationTextQuote(
  candidates: readonly HTMLElement[],
  readingMode: ReadingMode,
  viewport: { height: number; left: number; top: number; width: number },
  maxLength = 180,
) {
  if (!candidates.length) {
    return "";
  }

  const visibleIndex =
    readingMode === "paginated"
      ? findFirstVisiblePaginatedTtsBlockIndex(candidates, viewport.width, viewport.height, viewport.left, viewport.top)
      : findFirstVisibleTtsBlockIndex(candidates, viewport.width, viewport.height, viewport.top);

  const preferredCandidate = visibleIndex >= 0 ? candidates[visibleIndex] : candidates[0];
  const text = extractTtsBlockText(preferredCandidate);
  return text.slice(0, maxLength);
}

export function findFirstVisibleTextOffset(
  block: HTMLElement,
  viewportWidth: number,
  viewportHeight: number,
  viewportLeft = 0,
  viewportTop = 0,
) {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return null;
  }

  const doc = block.ownerDocument;
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();

  while (true) {
    const nextNode = walker.nextNode();
    if (!isTextNode(nextNode)) {
      break;
    }

    if (isWithinOmittableTtsElement(nextNode, block)) {
      continue;
    }

    const text = nextNode.textContent ?? "";
    if (!text.trim()) {
      continue;
    }

    for (let index = 0; index < text.length; index += 1) {
      if (/\s/.test(text[index] ?? "")) {
        continue;
      }

      range.setStart(nextNode, index);
      range.setEnd(nextNode, Math.min(text.length, index + 1));
      const rects = Array.from(range.getClientRects());

      if (
        rects.some((rect) => {
          const visibleRect = getVisibleRect(rect, viewportWidth, viewportHeight, viewportLeft, viewportTop);
          return visibleRect.width > 1 && visibleRect.height > 1;
        })
      ) {
        return {
          node: nextNode,
          offset: resolveWordStartOffset(nextNode, index),
        };
      }
    }
  }

  return null;
}

function findVisibleTextOffsetNearPoint(
  block: HTMLElement,
  viewportWidth: number,
  viewportHeight: number,
  targetLeft: number,
  targetTop: number,
  viewportLeft = 0,
  viewportTop = 0,
) {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return null;
  }

  const doc = block.ownerDocument;
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  let bestMatch:
    | {
        distance: number;
        left: number;
        node: Text;
        offset: number;
        top: number;
      }
    | null = null;

  while (true) {
    const nextNode = walker.nextNode();
    if (!isTextNode(nextNode)) {
      break;
    }

    if (isWithinOmittableTtsElement(nextNode, block)) {
      continue;
    }

    const text = nextNode.textContent ?? "";
    if (!text.trim()) {
      continue;
    }

    for (let index = 0; index < text.length; index += 1) {
      if (/\s/.test(text[index] ?? "")) {
        continue;
      }

      range.setStart(nextNode, index);
      range.setEnd(nextNode, Math.min(text.length, index + 1));
      const visibleRect = Array.from(range.getClientRects())
        .map((rect) => getVisibleRect(rect, viewportWidth, viewportHeight, viewportLeft, viewportTop))
        .find((rect) => rect.width > 1 && rect.height > 1);
      if (!visibleRect) {
        continue;
      }

      const centerLeft = visibleRect.left + visibleRect.width / 2;
      const centerTop = visibleRect.top + visibleRect.height / 2;
      const distance = Math.abs(centerLeft - targetLeft) + Math.abs(centerTop - targetTop) * 0.35;
      const offset = resolveWordStartOffset(nextNode, index);

      if (
        !bestMatch ||
        distance < bestMatch.distance ||
        (distance === bestMatch.distance &&
          (centerLeft < bestMatch.left || (centerLeft === bestMatch.left && centerTop < bestMatch.top)))
      ) {
        bestMatch = {
          distance,
          left: centerLeft,
          node: nextNode,
          offset,
          top: centerTop,
        };
      }
    }
  }

  return bestMatch ? { node: bestMatch.node, offset: bestMatch.offset } : null;
}

function resolveWordStartOffset(node: Node | null, offset: number) {
  if (!isTextNode(node)) {
    return offset;
  }

  const text = node.textContent ?? "";
  let cursor = clampOffset(offset, text.length);

  while (cursor > 0 && /\S/.test(text[cursor - 1] ?? "")) {
    cursor -= 1;
  }

  return cursor;
}

type LocationProgressResolver = {
  cfiFromPercentage?(percentage: number): string;
  generate(chars: number): Promise<unknown>;
  length(): number;
  percentageFromCfi(cfi: string): number;
};

function getLocationResolverLength(locations: Pick<LocationProgressResolver, "length"> | null | undefined) {
  if (!locations || typeof locations.length !== "function") {
    return 0;
  }

  try {
    const length = locations.length();
    return typeof length === "number" && Number.isFinite(length) ? length : 0;
  } catch {
    return 0;
  }
}

function hasReliableRelocatedPercentage(relocatedPercentage: number | undefined, locationsLength: number) {
  if (!(typeof relocatedPercentage === "number" && Number.isFinite(relocatedPercentage))) {
    return false;
  }

  if (relocatedPercentage > 0) {
    return true;
  }

  return locationsLength > 0;
}

export async function resolveLocationProgress(
  cfi: string,
  relocatedPercentage: number | undefined,
  locations: LocationProgressResolver | null | undefined,
) {
  const locationsLength = getLocationResolverLength(locations);
  if (hasReliableRelocatedPercentage(relocatedPercentage, locationsLength)) {
    return relocatedPercentage ?? 0;
  }

  if (!cfi || !locations || typeof locations.percentageFromCfi !== "function") {
    return 0;
  }

  if (locationsLength === 0 && typeof locations.generate === "function") {
    await locations.generate(1600);
  }

  const resolvedProgress = locations.percentageFromCfi(cfi);
  return typeof resolvedProgress === "number" && Number.isFinite(resolvedProgress) ? resolvedProgress : 0;
}

export function resolveLocationProgressSnapshot(
  cfi: string,
  relocatedPercentage: number | undefined,
  locations: Pick<LocationProgressResolver, "length" | "percentageFromCfi"> | null | undefined,
) {
  const locationsLength = getLocationResolverLength(locations);
  if (hasReliableRelocatedPercentage(relocatedPercentage, locationsLength)) {
    return relocatedPercentage ?? 0;
  }

  if (!cfi || locationsLength === 0 || !locations || typeof locations.percentageFromCfi !== "function") {
    return 0;
  }

  const resolvedProgress = locations.percentageFromCfi(cfi);
  return typeof resolvedProgress === "number" && Number.isFinite(resolvedProgress) ? resolvedProgress : 0;
}

export function resolveLocationCfiFromProgress(
  progress: number,
  locations: Pick<LocationProgressResolver, "cfiFromPercentage"> | null | undefined,
) {
  if (!(typeof progress === "number" && Number.isFinite(progress))) {
    return "";
  }

  if (!locations || typeof locations.cfiFromPercentage !== "function") {
    return "";
  }

  try {
    const normalizedProgress = Math.min(0.999, Math.max(0, progress));
    const cfi = locations.cfiFromPercentage(normalizedProgress);
    return typeof cfi === "string" ? cfi : "";
  } catch {
    return "";
  }
}

export function resolveStoredLocationCfi(relocatedCfi: string, preferredTarget?: string) {
  if (preferredTarget?.startsWith("epubcfi(")) {
    return preferredTarget;
  }

  return relocatedCfi;
}

export function resolvePreferredPaginatedLocationCfi(args: {
  locationStartCfi: string;
  preferredCfi: string;
  preservePreferredCfi?: boolean;
  visiblePaginatedCfi?: string;
}) {
  if (args.preservePreferredCfi) {
    return resolveStoredLocationCfi(args.locationStartCfi, args.preferredCfi);
  }

  return args.visiblePaginatedCfi || resolveStoredLocationCfi(args.locationStartCfi, args.preferredCfi);
}

export function resolveApproximateLocationProgress(
  locationStart: Pick<Location["start"], "displayed" | "index">,
  totalSpineItems: number,
) {
  if (!Number.isFinite(locationStart.index) || locationStart.index < 0 || totalSpineItems <= 0) {
    return 0;
  }

  const chapterBase = locationStart.index / totalSpineItems;
  const displayedTotal = Math.max(1, locationStart.displayed?.total ?? 1);
  const displayedPage = Math.max(1, locationStart.displayed?.page ?? 1);
  const chapterPageProgress =
    displayedTotal > 1 ? (displayedPage - 1) / displayedTotal / totalSpineItems : 0;

  return Math.min(0.999, chapterBase + chapterPageProgress);
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

function resolveTocTargetElement(document: Document, item: TocItem) {
  const target = getTocTarget(item);
  const fragment = getNavigationTargetFragment(target);
  if (!fragment) {
    return document.body.firstElementChild ?? document.body;
  }

  const fragmentElement =
    document.getElementById(fragment) ??
    document.querySelector<HTMLElement>(`[name="${fragment.replace(/"/g, '\\"')}"]`);

  if (!fragmentElement) {
    return null;
  }

  return getNearestTtsBlockElement(fragmentElement) ?? fragmentElement;
}

function createCollapsedRange(document: Document, node: Node) {
  const range = document.createRange();
  if (node.nodeType === Node.ELEMENT_NODE) {
    range.selectNodeContents(node);
  } else {
    range.setStart(node, 0);
    range.setEnd(node, 0);
  }
  range.collapse(true);
  return range;
}

function compareRangeStarts(left: Range, right: Range) {
  return left.compareBoundaryPoints(Range.START_TO_START, right);
}

type TocPathMatch = {
  path: TocItem[];
  point: Range;
};

type TocViewport = {
  height: number;
  left: number;
  readingMode: ReadingMode;
  top: number;
  width: number;
};

export function findActiveTocPathForRange(
  items: TocItem[],
  spineItemId: string,
  currentRange: Range | null,
  document: Document,
): TocItem[] {
  if (!spineItemId || !currentRange) {
    return [];
  }

  const currentPoint = createCollapsedRange(document, currentRange.startContainer);
  currentPoint.setStart(currentRange.startContainer, currentRange.startOffset);
  currentPoint.setEnd(currentRange.startContainer, currentRange.startOffset);

  let bestMatch: TocPathMatch | null = null;

  const visit = (entries: TocItem[], ancestors: TocItem[]) => {
    for (const item of entries) {
      const path = [...ancestors, item];

      if (getTocTargetSpineItemId(item) === spineItemId) {
        const targetElement = resolveTocTargetElement(document, item);
        if (targetElement && containsNode(document.body, targetElement)) {
          const targetPoint = createCollapsedRange(document, targetElement);
          if (compareRangeStarts(targetPoint, currentPoint) <= 0) {
            let shouldReplace = false;
            if (!bestMatch) {
              shouldReplace = true;
            } else {
              const currentBest = bestMatch;
              const pointComparison = compareRangeStarts(targetPoint, currentBest.point);
              shouldReplace = pointComparison > 0 || (pointComparison === 0 && path.length > currentBest.path.length);
            }

            if (shouldReplace) {
              bestMatch = {
                path,
                point: targetPoint,
              };
            }
          }
        }
      }

      if (item.children?.length) {
        visit(item.children, path);
      }
    }
  };

  visit(items, []);
  const resolvedBestMatch = bestMatch as TocPathMatch | null;
  if (resolvedBestMatch) {
    return resolvedBestMatch.path;
  }

  return findTocPathBySpineItemId(items, spineItemId);
}

export function findVisibleTocPathForViewport(
  items: TocItem[],
  spineItemId: string,
  document: Document,
  viewport: TocViewport,
): TocItem[] {
  if (!spineItemId || viewport.width <= 0 || viewport.height <= 0) {
    return [];
  }

  let bestMatch: TocItem[] = [];
  let bestRect: DOMRect | null = null;

  const isVisibleInViewport = (rect: DOMRect) => {
    if (viewport.readingMode === "paginated") {
      return (
        rect.right > viewport.left &&
        rect.left < viewport.left + viewport.width &&
        rect.bottom > 0 &&
        rect.top < viewport.height
      );
    }

    return (
      rect.bottom > viewport.top &&
      rect.top < viewport.top + viewport.height &&
      rect.right > 0 &&
      rect.left < viewport.width
    );
  };

  const shouldReplace = (rect: DOMRect, path: TocItem[]) => {
    if (!bestRect) {
      return true;
    }

    if (viewport.readingMode === "paginated") {
      if (rect.left !== bestRect.left) {
        return rect.left < bestRect.left;
      }

      if (rect.top !== bestRect.top) {
        return rect.top < bestRect.top;
      }
    } else {
      if (rect.top !== bestRect.top) {
        return rect.top < bestRect.top;
      }

      if (rect.left !== bestRect.left) {
        return rect.left < bestRect.left;
      }
    }

    return path.length > bestMatch.length;
  };

  const visit = (entries: TocItem[], ancestors: TocItem[]) => {
    for (const item of entries) {
      const path = [...ancestors, item];
      if (getTocTargetSpineItemId(item) === spineItemId) {
        const targetElement = resolveTocTargetElement(document, item);
        if (targetElement && containsNode(document.body, targetElement)) {
          const rect = targetElement.getBoundingClientRect();
          if (isVisibleInViewport(rect) && shouldReplace(rect, path)) {
            bestMatch = path;
            bestRect = rect;
          }
        }
      }

      if (item.children?.length) {
        visit(item.children, path);
      }
    }
  };

  visit(items, []);
  return bestMatch;
}

function readPaginatedPageOffset(readingMode: ReadingMode, container: HTMLElement | null) {
  if (readingMode !== "paginated" || !container) {
    return undefined;
  }

  return Math.max(0, container.scrollLeft);
}

function readScrolledViewportOffset(readingMode: ReadingMode, container: HTMLElement | null) {
  if (readingMode !== "scrolled" || !container) {
    return undefined;
  }

  return Math.max(0, container.scrollTop);
}

export function resolveHostResizeRestoreTarget(readingMode: ReadingMode, currentTarget: string) {
  if (readingMode !== "scrolled" && readingMode !== "paginated") {
    return undefined;
  }

  return currentTarget || undefined;
}

export function resolveHostResizeRestoreScrollTop(
  readingMode: ReadingMode,
  currentTarget: string,
  preservedScrollTop?: number,
) {
  if (readingMode !== "scrolled") {
    return undefined;
  }

  if (currentTarget) {
    return undefined;
  }

  return typeof preservedScrollTop === "number" && Number.isFinite(preservedScrollTop)
    ? Math.max(0, preservedScrollTop)
    : undefined;
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

function restoreScrolledViewportOffset(
  readingMode: ReadingMode,
  container: HTMLElement | null,
  scrollTop?: number,
) {
  if (readingMode !== "scrolled" || !container || typeof scrollTop !== "number" || !Number.isFinite(scrollTop)) {
    return;
  }

  container.scrollTop = Math.max(0, scrollTop);
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

function readScrolledFollowLeadPx(rect: Pick<DOMRect, "top" | "bottom">, viewportHeight: number) {
  if (viewportHeight <= 0) {
    return 0;
  }

  const segmentHeight = Math.max(0, rect.bottom - rect.top);
  const minimumLead = 28;
  const maximumLead = Math.min(72, Math.max(minimumLead, Math.round(viewportHeight * 0.08)));
  return Math.min(maximumLead, Math.max(minimumLead, Math.round(segmentHeight) + 12));
}

function readScrolledFollowLinePx(rect: Pick<DOMRect, "top" | "bottom">) {
  const segmentHeight = Math.max(0, rect.bottom - rect.top);
  return Math.min(40, Math.max(20, Math.round(segmentHeight)));
}

export function projectRectIntoViewport(
  frameRect: Pick<DOMRect, "left" | "top">,
  rect: Pick<DOMRect, "bottom" | "left" | "right" | "top">,
): ReaderSelectionRect {
  const top = frameRect.top + rect.top;
  const left = frameRect.left + rect.left;
  const right = frameRect.left + rect.right;
  const bottom = frameRect.top + rect.bottom;

  return {
    bottom,
    height: Math.max(0, bottom - top),
    left,
    right,
    top,
    width: Math.max(0, right - left),
  };
}

export function shouldAutoScrollTtsSegment(
  readingMode: ReadingMode,
  rect: Pick<DOMRect, "top" | "bottom">,
  viewportHeight: number,
  followPlayback = false,
) {
  if (!followPlayback || readingMode === "paginated" || viewportHeight <= 0) {
    return false;
  }

  if (rect.top < 0) {
    return true;
  }

  const leadPx = readScrolledFollowLeadPx(rect, viewportHeight);
  return rect.bottom > viewportHeight - leadPx;
}

export function resolvePaginatedFollowPageIndex(
  viewport: { clientWidth: number; currentPageIndex: number },
  rect: Pick<DOMRect, "left" | "right">,
  followPlayback = false,
) {
  if (!followPlayback || viewport.clientWidth <= 0) {
    return viewport.currentPageIndex;
  }

  const pageWidth = viewport.clientWidth;
  const clampedLeft = Math.max(0, rect.left);
  const clampedRight = Math.max(0, rect.right);
  const startPageIndex = Math.floor(clampedLeft / pageWidth);
  const endPageIndex = Math.floor(Math.max(0, clampedRight - 1) / pageWidth);

  if (viewport.currentPageIndex >= startPageIndex && viewport.currentPageIndex <= endPageIndex) {
    return viewport.currentPageIndex;
  }

  if (viewport.currentPageIndex < startPageIndex) {
    return startPageIndex;
  }

  return Math.max(0, endPageIndex);
}

export function resolveScrolledFollowScrollTop(
  viewport: { clientHeight: number; currentScrollTop: number },
  rect: Pick<DOMRect, "top" | "bottom">,
  followPlayback = false,
) {
  if (!followPlayback || viewport.clientHeight <= 0) {
    return viewport.currentScrollTop;
  }

  let nextScrollTop = viewport.currentScrollTop;
  let nextTop = rect.top;
  let nextBottom = rect.bottom;

  while (nextTop < 0 && nextScrollTop > 0) {
    const liveRect = { bottom: nextBottom, top: nextTop };
    const leadPx = readScrolledFollowLeadPx(liveRect, viewport.clientHeight);
    const linePx = readScrolledFollowLinePx(liveRect);
    const scrollStep = Math.max(1, viewport.clientHeight - leadPx - linePx);
    nextScrollTop = Math.max(0, nextScrollTop - scrollStep);
    nextTop += scrollStep;
    nextBottom += scrollStep;
  }

  while (nextBottom > viewport.clientHeight - readScrolledFollowLeadPx({ bottom: nextBottom, top: nextTop }, viewport.clientHeight)) {
    const liveRect = { bottom: nextBottom, top: nextTop };
    const leadPx = readScrolledFollowLeadPx(liveRect, viewport.clientHeight);
    const linePx = readScrolledFollowLinePx(liveRect);
    const scrollStep = Math.max(1, viewport.clientHeight - leadPx - linePx);
    nextScrollTop += scrollStep;
    nextTop -= scrollStep;
    nextBottom -= scrollStep;
  }

  return nextScrollTop;
}

export function getNearestTtsBlockElement(node: Node | null) {
  if (!node) {
    return null;
  }

  const element = isElementNode(node) ? node : node.parentElement;
  return element?.closest<HTMLElement>(ttsBlockSelector) ?? null;
}

function getTtsBlockElementForRange(range: Range | null) {
  if (!range) {
    return null;
  }

  return getNearestTtsBlockElement(range.startContainer) ?? getNearestTtsBlockElement(range.commonAncestorContainer);
}

function readResizeAnchorTop(range: Range | null) {
  if (!range) {
    return undefined;
  }

  const anchorElement = getTtsBlockElementForRange(range);
  if (anchorElement) {
    return anchorElement.getBoundingClientRect().top;
  }

  const rect =
    Array.from(range.getClientRects()).find((candidate) => candidate.width > 0 || candidate.height > 0) ??
    range.getBoundingClientRect();

  return Number.isFinite(rect.top) ? rect.top : undefined;
}

function readResizeAnchorLeft(range: Range | null) {
  if (!range) {
    return undefined;
  }

  const rect =
    Array.from(range.getClientRects()).find((candidate) => candidate.width > 0 || candidate.height > 0) ??
    range.getBoundingClientRect();
  if (Number.isFinite(rect.left)) {
    return rect.left;
  }

  const anchorElement = getTtsBlockElementForRange(range);
  if (!anchorElement) {
    return undefined;
  }

  const anchorLeft = anchorElement.getBoundingClientRect().left;
  return Number.isFinite(anchorLeft) ? anchorLeft : undefined;
}

export function findTtsBlockElementByText(
  root: ParentNode,
  text: string,
  options?: {
    allowContainedMatch?: boolean;
    allowPrefixMatch?: boolean;
  },
) {
  const normalizedSegment = normalizeSegmentText(text);
  if (!normalizedSegment) {
    return null;
  }

  const candidates = Array.from(root.querySelectorAll<HTMLElement>(ttsBlockSelector));
  let prefixMatch: HTMLElement | null = null;
  const segmentPrefix = normalizedSegment.slice(0, Math.min(normalizedSegment.length, 120));
  const allowContainedMatch = options?.allowContainedMatch ?? true;
  const allowPrefixMatch = options?.allowPrefixMatch ?? true;

  for (const candidate of candidates) {
    const candidateText = extractTtsBlockText(candidate);
    if (!candidateText) {
      continue;
    }

    if (normalizedSegment === candidateText || (allowContainedMatch && normalizedSegment.includes(candidateText))) {
      return candidate;
    }

    if (allowPrefixMatch && !prefixMatch && segmentPrefix && candidateText.includes(segmentPrefix)) {
      prefixMatch = candidate;
    }
  }

  return prefixMatch;
}

export function findScrolledResizeAnchorElementByText(root: ParentNode, text: string) {
  return (
    findTtsBlockElementByText(root, text, {
      allowContainedMatch: false,
      allowPrefixMatch: false,
    }) ??
    findTtsBlockElementByText(root, text, {
      allowContainedMatch: false,
      allowPrefixMatch: true,
    })
  );
}

export function findTtsSegmentTextRange(root: HTMLElement, text: string, startOffset?: number, endOffset?: number) {
  const normalizedSegment = normalizeSegmentText(text);
  if (!normalizedSegment) {
    return null;
  }

  const { positions, text: normalizedText } = collectNormalizedTtsText(root);
  if (!positions.length) {
    return null;
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

function getNormalizedTextOffset(root: HTMLElement, targetNode: Node | null, targetOffset: number) {
  if (!isTextNode(targetNode)) {
    return 0;
  }

  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();
  let normalizedOffset = 0;
  let lastWasWhitespace = true;

  while (currentNode) {
    if (!isTextNode(currentNode) || !currentNode.nodeValue) {
      currentNode = walker.nextNode();
      continue;
    }

    const textNode = currentNode;
    const rawText = textNode.nodeValue ?? "";
    const includeNode = !isWithinOmittableTtsElement(textNode, root);

    for (let index = 0; index < rawText.length; index += 1) {
      if (textNode === targetNode && index === targetOffset) {
        return normalizedOffset;
      }

      if (!includeNode) {
        continue;
      }

      const character = rawText[index] ?? "";
      if (/\s/u.test(character)) {
        if (!lastWasWhitespace && normalizedOffset > 0) {
          normalizedOffset += 1;
          lastWasWhitespace = true;
        }
        continue;
      }

      normalizedOffset += 1;
      lastWasWhitespace = false;
    }

    if (textNode === targetNode && targetOffset >= rawText.length) {
      return normalizedOffset;
    }

    currentNode = walker.nextNode();
  }

  return normalizedOffset;
}

function containsNode(root: Node, target: Node | null) {
  if (!target) {
    return false;
  }

  return root === target || Boolean(root.contains(target));
}

function findSelectionRangeInCurrentContents(
  contents: Contents,
  candidates: readonly HTMLElement[],
  cfiRange: string,
  selectionText: string,
) {
  const candidateDocument = contents.document;

  try {
    const currentRange = contents.range(cfiRange);
    if (currentRange && containsNode(candidateDocument.body, currentRange.startContainer)) {
      const selectedIndex = candidates.findIndex((candidate) => containsNode(candidate, currentRange.startContainer));
      if (selectedIndex >= 0) {
        return {
          range: currentRange,
          selectedIndex,
        };
      }
    }
  } catch {
    // Fall back to text-based targeting below.
  }

  if (!selectionText) {
    return null;
  }

  const selectedIndex = candidates.findIndex((candidate) =>
    extractTtsBlockText(candidate).includes(selectionText),
  );
  if (selectedIndex < 0) {
    return null;
  }

  const textRange = findTtsSegmentTextRange(candidates[selectedIndex], selectionText);
  if (!textRange) {
    return null;
  }

  return {
    range: textRange,
    selectedIndex,
  };
}

export const epubViewportRuntime: EpubViewportRuntime = {
  async render({
    bookId,
    element,
    flow = "scrolled",
    initialCfi,
    initialPageIndex,
    initialPageOffset,
    initialScrollTop,
    initialPreferences,
    onRelocated,
    onPagePresentationChange,
    onSelectionChange,
    onTocChange,
  }) {
    const bookFile = await loadStoredBookFile(bookId);
    const book = ePub(await bookFile.arrayBuffer());
    let locationsGenerationPromise: Promise<unknown> | null = null;
    const rendition = book.renderTo(element, {
      width: "100%",
      height: "100%",
      flow: toEpubFlow(flow),
      spread: flow === "paginated" ? "none" : "auto",
      allowScriptedContent: false,
    });
    const renditionWithSafeLocated = rendition as typeof rendition & {
      located?: (location: unknown) => unknown;
    };
    if (typeof renditionWithSafeLocated.located === "function") {
      const originalLocated = renditionWithSafeLocated.located.bind(renditionWithSafeLocated);
      renditionWithSafeLocated.located = ((location: unknown) => {
        if (!location || typeof location !== "object" || typeof (location as { length?: unknown }).length !== "number") {
          return {};
        }

        return originalLocated(location);
      }) as typeof renditionWithSafeLocated.located;
    }
    let currentTarget = initialCfi ?? "";
    let currentPaginatedResizeTarget = flow === "paginated" ? initialCfi ?? "" : "";
    let currentContents: Contents | null = null;
    let currentSpineItemId = "";
    let currentToc: TocItem[] = [];
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
    let preferredScrolledRestore:
      | {
          cfi: string;
          scrollTop?: number;
        }
      | null = flow === "scrolled" && initialCfi
      ? {
          cfi: initialCfi,
          scrollTop: initialScrollTop,
        }
      : null;
    let activeTtsSegment: ActiveTtsSegment | null = null;
    let followTtsPlayback = false;
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
    let isDestroyed = false;
    let relocationSequence = 0;
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
    const getVisibleViewportMetrics = () => {
      const hostRect = element.getBoundingClientRect();
      const container = element.querySelector<HTMLElement>(".epub-container");
      return {
        height: Math.max(0, Math.round(hostRect.height)),
        left:
          activePreferences.readingMode === "paginated" ? Math.max(0, Math.round(container?.scrollLeft ?? 0)) : 0,
        top:
          activePreferences.readingMode === "scrolled" ? Math.max(0, Math.round(container?.scrollTop ?? 0)) : 0,
        width: Math.max(0, Math.round(hostRect.width)),
      };
    };
    const syncCurrentContents = () => {
      const contents = rendition.getContents();
      const contentList = Array.isArray(contents) ? contents : contents ? [contents] : [];
      const nextContents =
        contentList[findMostVisibleContentsIndex(contentList, element)] ??
        contentList[0] ??
        null;

      if (nextContents) {
        currentContents = nextContents;
        attachSelectionLifecycle(nextContents);
        syncPagePresentation(nextContents);
        void applyActiveTtsSegment(activeTtsSegment);
      }
    };

    const getRenditionContents = () => {
      const contents = rendition.getContents();
      return Array.isArray(contents) ? contents : contents ? [contents] : [];
    };

    const readScrolledContentsTop = (contents: Contents, localTop: number) => {
      const containerTop = getPaginatedContainer(element)?.getBoundingClientRect().top;
      const frameElement = contents.window.frameElement;
      const frameTop = isElementNode(frameElement) ? frameElement.getBoundingClientRect().top : undefined;
      return resolveScrolledContentsTop(localTop, frameTop, containerTop);
    };

    const resolveScrolledResizeAnchorRestoreScrollTop = (anchor: ScrolledResizeRestoreAnchor | null) => {
      if (!anchor) {
        return undefined;
      }

      for (const contents of getRenditionContents()) {
        const anchorElement = findScrolledResizeAnchorElementByText(contents.document.body, anchor.textQuote);
        const anchorTop = anchorElement
          ? readScrolledContentsTop(contents, anchorElement.getBoundingClientRect().top)
          : undefined;
        if (typeof anchorTop === "number") {
          return resolveScrolledResizeAnchorScrollTop(anchorTop, anchor.offsetFromViewportTop);
        }
      }

      if (!anchor.cfi) {
        return undefined;
      }

      for (const contents of getRenditionContents()) {
        try {
          const range = contents.range(anchor.cfi);
          if (!range || !containsNode(contents.document.body, range.startContainer)) {
            continue;
          }

          const anchorTop = readScrolledContentsTop(contents, readResizeAnchorTop(range) ?? Number.NaN);
          if (typeof anchorTop === "number") {
            return resolveScrolledResizeAnchorScrollTop(anchorTop, anchor.offsetFromViewportTop);
          }
        } catch {
          continue;
        }
      }

      return undefined;
    };

    const resolvePaginatedResizeAnchorRestoreScrollLeft = (anchor: PaginatedResizeRestoreAnchor | null) => {
      if (!anchor) {
        return undefined;
      }

      if (anchor.cfi) {
        for (const contents of getRenditionContents()) {
          try {
            const range = contents.range(anchor.cfi);
            if (!range || !containsNode(contents.document.body, range.startContainer)) {
              continue;
            }

            const anchorLeft = readResizeAnchorLeft(range);
            if (typeof anchorLeft === "number") {
              return resolvePaginatedResizeAnchorScrollLeft(anchorLeft, anchor.offsetFromViewportLeft);
            }
          } catch {
            continue;
          }
        }
      }

      for (const contents of getRenditionContents()) {
        const anchorElement = findTtsBlockElementByText(contents.document.body, anchor.textQuote, {
          allowContainedMatch: false,
          allowPrefixMatch: false,
        });
        const anchorLeft = anchorElement?.getBoundingClientRect().left;
        if (typeof anchorLeft === "number") {
          return resolvePaginatedResizeAnchorScrollLeft(anchorLeft, anchor.offsetFromViewportLeft);
        }
      }

      return undefined;
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

    const applyCurrentReaderTheme = () => {
      applyReaderThemeToRendition(rendition as never, activePreferences);
    };

    const readRectMetrics = (rect: Pick<DOMRect, "bottom" | "left" | "right" | "top">): ReaderSelectionRect => ({
      bottom: rect.bottom,
      height: Math.max(0, rect.bottom - rect.top),
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: Math.max(0, rect.right - rect.left),
    });

    let hostResizeObserver: ResizeObserver | null = null;
    let queuedHostResize: { height: number; width: number } | null = null;
    let hostResizeSyncInFlight = false;
    let activeHostResizeRestoreTarget: string | null = null;
    let isRenditionReadyForHostResize = false;
    let lastObservedHostSize = {
      height: Math.round(element.clientHeight),
      width: Math.round(element.clientWidth),
    };

    const hasRenderableViewport = () => Boolean(currentContents || element.querySelector("iframe"));

    const syncRenditionToHostResize = async (width: number, height: number) => {
      if (isDestroyed || width <= 0 || height <= 0 || !hasRenderableViewport()) {
        return;
      }

      await waitForLayoutFrame(element.ownerDocument);
      if (isDestroyed || !hasRenderableViewport()) {
        return;
      }

      const container = getPaginatedContainer(element);
      const preservedPageIndex = readPaginatedPageIndex(activePreferences.readingMode, container);
      const preservedPageOffset = readPaginatedPageOffset(activePreferences.readingMode, container);
      const preservedScrollTop = readScrolledViewportOffset(activePreferences.readingMode, container);
      const preservedScrollMax =
        activePreferences.readingMode === "scrolled" && container
          ? Math.max(0, container.scrollHeight - container.clientHeight)
          : undefined;
      const preservedScrollProgress =
        typeof preservedScrollTop === "number" &&
        Number.isFinite(preservedScrollTop) &&
        typeof preservedScrollMax === "number" &&
        Number.isFinite(preservedScrollMax) &&
        preservedScrollMax > 0
          ? preservedScrollTop / preservedScrollMax
          : undefined;
      const scrolledResizeAnchor =
        activePreferences.readingMode === "scrolled" && currentContents
          ? captureScrolledResizeRestoreAnchor(
              currentContents,
              Array.from(currentContents.document.body.querySelectorAll<HTMLElement>(ttsBlockSelector)),
              getVisibleViewportMetrics(),
            )
          : null;
      const paginatedResizeAnchor =
        activePreferences.readingMode === "paginated" && currentContents
          ? capturePaginatedResizeRestoreAnchor(
              currentContents,
              Array.from(currentContents.document.body.querySelectorAll<HTMLElement>(ttsBlockSelector)),
              getVisibleViewportMetrics(),
            )
          : null;
      const resizeRestoreTarget = resolveHostResizeRestoreTarget(activePreferences.readingMode, currentTarget);
      const paginatedResizeRestoreTarget =
        activePreferences.readingMode === "paginated"
          ? paginatedResizeAnchor?.cfi || currentPaginatedResizeTarget || resizeRestoreTarget || currentTarget || null
          : null;

      if (paginatedResizeRestoreTarget) {
        activeHostResizeRestoreTarget = paginatedResizeRestoreTarget;
      }

      try {
        rendition.resize(width, height);
        await waitForLayoutFrame(element.ownerDocument);
        syncCurrentContents();

        if (!hasRenderableViewport()) {
          await rendition.display(currentTarget || undefined);
          await waitForLayoutFrame(element.ownerDocument);
          syncCurrentContents();
        }

        if (!hasRenderableViewport()) {
          return;
        }

        if (activePreferences.readingMode === "paginated") {
          if (paginatedResizeRestoreTarget) {
            await rendition.display(paginatedResizeRestoreTarget);
            await waitForLayoutFrame(element.ownerDocument);
            syncCurrentContents();
          } else {
            await settlePaginatedPosition(activePreferences.readingMode, preservedPageOffset, preservedPageIndex);
          }
          const restoredPaginatedAnchor = await settlePaginatedResizeAnchorPosition(
            activePreferences.readingMode,
            paginatedResizeAnchor,
            width,
          );
          if (!restoredPaginatedAnchor) {
            await settleDisplayedPaginatedLocation(activePreferences.readingMode);
          }
        } else {
          const resizedContainer = getPaginatedContainer(element);
          const proportionalScrollTop =
            resizedContainer && typeof preservedScrollMax === "number"
              ? resolveScrolledResizeFallbackScrollTop(
                  preservedScrollTop,
                  preservedScrollMax,
                  Math.max(0, resizedContainer.scrollHeight - resizedContainer.clientHeight),
                )
              : undefined;
          const resolvedAnchorScrollTop = resolveScrolledResizeAnchorRestoreScrollTop(scrolledResizeAnchor);
          const shouldTrustAnchorScrollTop =
            typeof resolvedAnchorScrollTop === "number" &&
            (typeof proportionalScrollTop !== "number" ||
              Math.abs(resolvedAnchorScrollTop - proportionalScrollTop) <=
                Math.max(640, Math.round((resizedContainer?.clientHeight ?? 0) * 1.5)));
          if (shouldTrustAnchorScrollTop) {
            await settleScrolledPosition(activePreferences.readingMode, resolvedAnchorScrollTop);
          } else {
            await settleScrolledPositionWithProgress(
              activePreferences.readingMode,
              preservedScrollProgress,
              proportionalScrollTop ??
                resolveHostResizeRestoreScrollTop(activePreferences.readingMode, currentTarget, preservedScrollTop),
            );
          }
        }

        await syncDisplayedLocation();
      } finally {
        if (activeHostResizeRestoreTarget === paginatedResizeRestoreTarget) {
          activeHostResizeRestoreTarget = null;
        }
      }
    };

    const queueHostResizeSync = (width: number, height: number) => {
      if (width <= 0 || height <= 0) {
        return;
      }

      queuedHostResize = {
        height,
        width,
      };

      if (!isRenditionReadyForHostResize || hostResizeSyncInFlight) {
        return;
      }

      hostResizeSyncInFlight = true;

      void (async () => {
        while (queuedHostResize && !isDestroyed) {
          const nextSize = queuedHostResize;
          queuedHostResize = null;
          await syncRenditionToHostResize(nextSize.width, nextSize.height);
        }
      })().finally(() => {
        hostResizeSyncInFlight = false;
      });
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
      const container = getPaginatedContainer(element);
      const frameElement = currentContents.window.frameElement;
      const frameRect = isElementNode(frameElement) ? frameElement.getBoundingClientRect() : null;
      const containerRect = container?.getBoundingClientRect() ?? null;
      const viewportHeight =
        (activePreferences.readingMode !== "paginated" ? container?.clientHeight : 0) ||
        (frameRect?.height ?? 0) ||
        view.innerHeight ||
        revealTarget.ownerDocument.documentElement.clientHeight ||
        0;
      const viewportWidth = view.innerWidth || revealTarget.ownerDocument.documentElement.clientWidth || 0;
      const scrolledContainerRect =
        container && frameRect && containerRect
          ? {
              bottom: frameRect.top - containerRect.top + rect.bottom,
              top: frameRect.top - containerRect.top + rect.top,
            }
          : null;
      const shouldRevealPaginatedTarget =
        followTtsPlayback &&
        activePreferences.readingMode === "paginated" &&
        viewportWidth > 0 &&
        resolvePaginatedFollowPageIndex(
          {
            clientWidth: container?.clientWidth ?? viewportWidth,
            currentPageIndex: readPaginatedPageIndex(activePreferences.readingMode, container) ?? 0,
          },
          rect,
          true,
        ) !== (readPaginatedPageIndex(activePreferences.readingMode, container) ?? 0);
      const shouldRevealScrolledTarget =
        activePreferences.readingMode !== "paginated" &&
        scrolledContainerRect &&
        shouldAutoScrollTtsSegment(activePreferences.readingMode, scrolledContainerRect, viewportHeight, followTtsPlayback);

      if (shouldRevealScrolledTarget && container && scrolledContainerRect) {
        let nextScrollTop = resolveScrolledFollowScrollTop(
          {
            clientHeight: container.clientHeight,
            currentScrollTop: container.scrollTop,
          },
          scrolledContainerRect,
          followTtsPlayback,
        );

        while (nextScrollTop !== container.scrollTop) {
          container.scrollTop = nextScrollTop;
          await waitForLayoutFrame(element.ownerDocument);

          const liveTarget = activeTtsElement ?? nextElement;
          const liveRect = liveTarget.getBoundingClientRect();
          const liveFrameRect = isElementNode(frameElement) ? frameElement.getBoundingClientRect() : null;
          const liveContainerRect = container.getBoundingClientRect();
          if (!liveFrameRect) {
            break;
          }

          const liveScrolledRect = {
            bottom: liveFrameRect.top - liveContainerRect.top + liveRect.bottom,
            top: liveFrameRect.top - liveContainerRect.top + liveRect.top,
          };
          const resolvedScrollTop = resolveScrolledFollowScrollTop(
            {
              clientHeight: container.clientHeight,
              currentScrollTop: container.scrollTop,
            },
            liveScrolledRect,
            followTtsPlayback,
          );

          if (resolvedScrollTop === container.scrollTop) {
            break;
          }

          nextScrollTop = resolvedScrollTop;
        }

        return;
      }

      if (shouldRevealPaginatedTarget) {
        const pageContainer = getPaginatedContainer(element);
        const pageWidth = pageContainer?.clientWidth || viewportWidth;

        if (pageContainer && pageWidth > 0) {
          const currentPageIndex = readPaginatedPageIndex(activePreferences.readingMode, pageContainer) ?? 0;
          const targetPageIndex = resolvePaginatedFollowPageIndex(
            {
              clientWidth: pageWidth,
              currentPageIndex,
            },
            rect,
            followTtsPlayback,
          );

          if (targetPageIndex !== currentPageIndex) {
            restorePaginatedPagePosition(activePreferences.readingMode, pageContainer, undefined, targetPageIndex);
            await waitForSettledPaginatedContainer(element, pageWidth);
            await waitForLayoutFrame(element.ownerDocument);
            void syncDisplayedLocation();
            const latestSegment = activeTtsSegment;
            if (attempt < 4 && latestSegment) {
              await applyActiveTtsSegment(latestSegment, attempt + 1);
            }
            return;
          }
        }
      }
    };

    const getLocationTextQuote = async (cfi: string) => {
      const fallbackText = normalizeText(currentContents?.document.body?.innerText ?? "");
      const visibleCandidates = currentContents
        ? Array.from(currentContents.document.body.querySelectorAll<HTMLElement>(ttsBlockSelector))
        : [];
      const visibleTextQuote = visibleCandidates.length
        ? findVisibleLocationTextQuote(visibleCandidates, activePreferences.readingMode, getVisibleViewportMetrics())
        : "";
      if (visibleTextQuote) {
        return visibleTextQuote;
      }

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

    const ensureResolvedLocationProgress = async (cfi: string, relocatedPercentage?: number) => {
      const locations = book.locations;
      if (getLocationResolverLength(locations) === 0 && locations && typeof locations.generate === "function") {
        locationsGenerationPromise ??= locations.generate(1600).catch(() => null);
        await locationsGenerationPromise;
      }

      return resolveLocationProgress(cfi, relocatedPercentage, locations);
    };

    const shouldDeferResolvedLocationProgress = (cfi: string, relocatedPercentage?: number) =>
      !hasReliableRelocatedPercentage(relocatedPercentage, getLocationResolverLength(book.locations)) &&
      Boolean(cfi) &&
      getLocationResolverLength(book.locations) === 0;

    const queueDeferredResolvedLocationProgress = (
      storedLocation: {
        cfi: string;
        pageIndex?: number;
        pageOffset?: number;
        progress: number;
        spineItemId: string;
        textQuote: string;
      },
      relocatedPercentage: number | undefined,
      sequence: number,
    ) => {
      if (!shouldDeferResolvedLocationProgress(storedLocation.cfi, relocatedPercentage)) {
        return;
      }

      void ensureResolvedLocationProgress(storedLocation.cfi, relocatedPercentage)
        .then((resolvedProgress) => {
          if (
            isDestroyed ||
            sequence !== relocationSequence ||
            currentTarget !== storedLocation.cfi ||
            currentSpineItemId !== storedLocation.spineItemId ||
            resolvedProgress === storedLocation.progress
          ) {
            return;
          }

          onRelocated?.({
            ...storedLocation,
            progress: resolvedProgress,
          });
        })
        .catch(() => undefined);
    };

    const resolveVisiblePaginatedLocationCfi = () => {
      if (activePreferences.readingMode !== "paginated" || !currentContents) {
        return "";
      }

      const visibleCandidates = Array.from(currentContents.document.body.querySelectorAll<HTMLElement>(ttsBlockSelector));
      if (!visibleCandidates.length) {
        return "";
      }

      return captureLeadingPaginatedVisibleCfi(currentContents, visibleCandidates, getVisibleViewportMetrics());
    };

    const resolveCurrentPaginatedResizeTarget = () => {
      if (activePreferences.readingMode !== "paginated" || !currentContents) {
        return "";
      }

      const visibleCandidates = Array.from(currentContents.document.body.querySelectorAll<HTMLElement>(ttsBlockSelector));
      if (!visibleCandidates.length) {
        return "";
      }

      return capturePaginatedResizeRestoreAnchor(currentContents, visibleCandidates, getVisibleViewportMetrics())?.cfi ?? "";
    };

    const toStoredLocation = async (location: Location) => {
      const cfi = resolveVisiblePaginatedLocationCfi() || location.start.cfi;
      const relocatedPercentage =
        cfi === location.start.cfi ? location.start.percentage : undefined;
      const exactProgress = resolveLocationProgressSnapshot(cfi, relocatedPercentage, book.locations);
      const progress =
        exactProgress > 0
          ? exactProgress
          : resolveApproximateLocationProgress(location.start, book.packaging?.spine?.length ?? 0);
      const spineItemId = location.start.href;
      const textQuote = await getLocationTextQuote(cfi);

      return {
        cfi,
        pageIndex: readPaginatedPageIndex(activePreferences.readingMode, getPaginatedContainer(element)),
        pageOffset: readPaginatedPageOffset(activePreferences.readingMode, getPaginatedContainer(element)),
        progress,
        scrollTop: readScrolledViewportOffset(activePreferences.readingMode, getPaginatedContainer(element)),
        spineItemId,
        textQuote,
      };
    };

    const toPreferredStoredLocation = async (location: Location, cfi: string) => {
      const storedCfi =
        activePreferences.readingMode === "paginated"
          ? resolvePreferredPaginatedLocationCfi({
              locationStartCfi: location.start.cfi,
              preferredCfi: cfi,
              preservePreferredCfi: cfi === activeHostResizeRestoreTarget,
              visiblePaginatedCfi: resolveVisiblePaginatedLocationCfi(),
            })
          : resolveStoredLocationCfi(location.start.cfi, cfi);
      const relocatedPercentage =
        storedCfi === location.start.cfi ? location.start.percentage : undefined;
      const exactProgress = resolveLocationProgressSnapshot(storedCfi, relocatedPercentage, book.locations);
      const progress =
        exactProgress > 0
          ? exactProgress
          : resolveApproximateLocationProgress(location.start, book.packaging?.spine?.length ?? 0);
      const spineItemId = location.start.href;
      const textQuote = await getLocationTextQuote(storedCfi);

      return {
        cfi: storedCfi,
        pageIndex: readPaginatedPageIndex(activePreferences.readingMode, getPaginatedContainer(element)),
        pageOffset: readPaginatedPageOffset(activePreferences.readingMode, getPaginatedContainer(element)),
        progress,
        scrollTop: readScrolledViewportOffset(activePreferences.readingMode, getPaginatedContainer(element)),
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
      const view = contents.window;
      const hostView =
        (isElementNode(view.frameElement) ? view.frameElement.ownerDocument?.defaultView : null) ??
        (typeof window !== "undefined" ? window : null);
      if (selectionDocumentCleanups.has(doc)) {
        return;
      }

      const handlePointerDown = () => {
        pointerSelecting = true;
        currentContents = contents;
        syncPagePresentation(contents);
        void applyActiveTtsSegment(activeTtsSegment);

        const snapshot = getSelectionSnapshotFromContents(contents);
        if (!snapshot) {
          pendingSelection = null;
          onSelectionChange?.({
            cfiRange: "",
            isReleased: false,
            spineItemId: "",
            text: "",
          });
          return;
        }

        pendingSelection = {
          ...snapshot,
          isReleased: false,
        };
        onSelectionChange?.(pendingSelection);
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

      const handleSelectionChange = () => {
        currentContents = contents;
        syncPagePresentation(contents);
        void applyActiveTtsSegment(activeTtsSegment);

        const snapshot = getSelectionSnapshotFromContents(contents);
        if (!snapshot) {
          if (!pointerSelecting) {
            pendingSelection = null;
          }
          return;
        }

        const selection = {
          ...snapshot,
          isReleased: !pointerSelecting,
        };

        if (pointerSelecting) {
          pendingSelection = selection;
        }

        onSelectionChange?.(selection);
      };

      doc.addEventListener("mousedown", handlePointerDown, true);
      doc.addEventListener("mouseup", handlePointerUp, true);
      doc.addEventListener("selectionchange", handleSelectionChange, true);
      doc.addEventListener("touchstart", handlePointerDown, true);
      doc.addEventListener("touchend", handlePointerUp, true);
      doc.addEventListener("keydown", handlePaginatedArrowKey, true);
      view.addEventListener("mouseup", handlePointerUp, true);
      view.addEventListener("pointerup", handlePointerUp, true);
      view.addEventListener("touchend", handlePointerUp, true);
      view.addEventListener("blur", handlePointerUp, true);
      hostView?.addEventListener("mouseup", handlePointerUp, true);
      hostView?.addEventListener("pointerup", handlePointerUp, true);
      hostView?.addEventListener("touchend", handlePointerUp, true);
      hostView?.addEventListener("blur", handlePointerUp, true);
      doc.addEventListener("wheel", handlePaginatedWheel, {
        capture: true,
        passive: false,
      });

      selectionDocumentCleanups.set(doc, () => {
        doc.removeEventListener("mousedown", handlePointerDown, true);
        doc.removeEventListener("mouseup", handlePointerUp, true);
        doc.removeEventListener("selectionchange", handleSelectionChange, true);
        doc.removeEventListener("touchstart", handlePointerDown, true);
        doc.removeEventListener("touchend", handlePointerUp, true);
        doc.removeEventListener("keydown", handlePaginatedArrowKey, true);
        view.removeEventListener("mouseup", handlePointerUp, true);
        view.removeEventListener("pointerup", handlePointerUp, true);
        view.removeEventListener("touchend", handlePointerUp, true);
        view.removeEventListener("blur", handlePointerUp, true);
        hostView?.removeEventListener("mouseup", handlePointerUp, true);
        hostView?.removeEventListener("pointerup", handlePointerUp, true);
        hostView?.removeEventListener("touchend", handlePointerUp, true);
        hostView?.removeEventListener("blur", handlePointerUp, true);
        doc.removeEventListener("wheel", handlePaginatedWheel, true);
      });
    };

    const getTtsBlocksFromCurrentLocation = async () => {
      syncCurrentContents();
      const contents = currentContents;
      if (!contents) {
        return [];
      }

      const doc = contents.document;
      const candidates = Array.from(doc.body.querySelectorAll<HTMLElement>(ttsBlockSelector));
      if (!candidates.length) {
        return [];
      }
      const viewport = getVisibleViewportMetrics();
      const firstVisibleIndex =
        activePreferences.readingMode === "paginated"
          ? findFirstVisiblePaginatedTtsBlockIndex(candidates, viewport.width, viewport.height, viewport.left, viewport.top)
          : findFirstVisibleTtsBlockIndex(candidates, viewport.width, viewport.height, viewport.top);
      const firstVisibleStart =
        firstVisibleIndex >= 0
          ? findFirstVisibleTextOffset(
              candidates[firstVisibleIndex],
              viewport.width,
              viewport.height,
              viewport.left,
              viewport.top,
            )
          : null;

      let startNode: Node | null = null;
      let startOffset = 0;

      if (currentTarget) {
        try {
          const range = await book.getRange(currentTarget);
          startNode = range?.startContainer ?? null;
          startOffset = resolveWordStartOffset(startNode, range?.startOffset ?? 0);
        } catch {
          startNode = null;
        }
      }

      const preciseStartIndex = startNode
        ? Math.max(
            0,
            candidates.findIndex((candidate) => {
              if (candidate.contains(startNode)) {
                return true;
              }

              return Boolean(startNode.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING);
            }),
          )
        : -1;
      const startIndex = firstVisibleIndex >= 0 ? firstVisibleIndex : Math.max(0, preciseStartIndex);

      return candidates
        .slice(startIndex)
        .map((candidate, index) => {
          const candidateIndex = startIndex + index;
          const cfi = getBlockCfi(contents, candidate);
          const fullText = extractTtsBlockText(candidate);
          const visibleStartNode =
            candidateIndex === firstVisibleIndex && firstVisibleStart && candidate.contains(firstVisibleStart.node)
              ? firstVisibleStart.node
              : null;
          const visibleStartOffset =
            candidateIndex === firstVisibleIndex && firstVisibleStart ? firstVisibleStart.offset : 0;
          const fallbackStartNode =
            firstVisibleIndex < 0 && candidateIndex === preciseStartIndex && startNode && candidate.contains(startNode)
              ? startNode
              : null;
          const fallbackStartOffset = firstVisibleIndex < 0 && candidateIndex === preciseStartIndex ? startOffset : 0;
          const rangeStartNode = visibleStartNode ?? fallbackStartNode;
          const rangeStartOffset = visibleStartNode ? visibleStartOffset : fallbackStartOffset;

          if (!rangeStartNode) {
            return {
              cfi,
              locatorText: fullText,
              sourceEnd: fullText.length,
              sourceStart: 0,
              spineItemId: currentSpineItemId,
              tagName: candidate.tagName.toLowerCase(),
              text: fullText,
            };
          }

          const candidateRange = doc.createRange();
          candidateRange.selectNodeContents(candidate);
          candidateRange.setStart(rangeStartNode, rangeStartOffset);
          const text = extractTtsBlockText(candidateRange.cloneContents());
          const sourceStart = getNormalizedTextOffset(candidate, rangeStartNode, rangeStartOffset);
          return {
            cfi,
            locatorText: fullText,
            sourceEnd: sourceStart + text.length,
            sourceStart,
            spineItemId: currentSpineItemId,
            tagName: candidate.tagName.toLowerCase(),
            text,
          };
        })
        .filter((block) => Boolean(block.text));
    };

    const buildTtsBlocksFromRangeStart = (
      contents: Contents,
      candidates: HTMLElement[],
      selectedIndex: number,
      startNode: Node,
      startOffset: number,
    ) => {
      const doc = contents.document;

      return candidates
        .slice(selectedIndex)
        .map((candidate, index) => {
          const cfi = getBlockCfi(contents, candidate);
          const fullText = extractTtsBlockText(candidate);

          if (index > 0) {
            return {
              cfi,
              locatorText: fullText,
              sourceEnd: fullText.length,
              sourceStart: 0,
              spineItemId: currentSpineItemId,
              tagName: candidate.tagName.toLowerCase(),
              text: fullText,
            };
          }

          const candidateRange = doc.createRange();
          candidateRange.selectNodeContents(candidate);
          candidateRange.setStart(startNode, startOffset);
          const text = extractTtsBlockText(candidateRange.cloneContents());
          const sourceStart = getNormalizedTextOffset(candidate, startNode, startOffset);
          return {
            cfi,
            locatorText: fullText,
            sourceEnd: sourceStart + text.length,
            sourceStart,
            spineItemId: currentSpineItemId,
            tagName: candidate.tagName.toLowerCase(),
            text,
          };
        })
        .filter((block) => Boolean(block.text));
    };

    const getTtsBlocksFromSelectionRange = (contents: Contents, range: Range) => {
      const doc = contents.document;
      const candidates = Array.from(doc.body.querySelectorAll<HTMLElement>(ttsBlockSelector));
      if (!candidates.length) {
        return [];
      }

      const selectedIndex = candidates.findIndex((candidate) => containsNode(candidate, range.startContainer));
      if (selectedIndex < 0) {
        return [];
      }

      const viewport = getVisibleViewportMetrics();
      if (
        !isVisibleTtsBlock(
          candidates[selectedIndex].getBoundingClientRect(),
          viewport.width,
          viewport.height,
          viewport.left,
          viewport.top,
        )
      ) {
        return [];
      }

      return buildTtsBlocksFromRangeStart(
        contents,
        candidates,
        selectedIndex,
        range.startContainer,
        resolveWordStartOffset(range.startContainer, range.startOffset ?? 0),
      );
    };

    const getCurrentSelectionRangeSnapshot = (): { contents: Contents; range: Range } | null => {
      const contents = rendition.getContents();
      const contentList: Contents[] = Array.isArray(contents) ? contents : contents ? [contents] : [];

      for (const entry of contentList) {
        const selection = entry.window.getSelection?.();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          continue;
        }

        const range = selection.getRangeAt(0);
        if (!range.toString().trim()) {
          continue;
        }

        currentContents = entry;
        attachSelectionLifecycle(entry);
        syncPagePresentation(entry);
        return {
          contents: entry,
          range: range.cloneRange(),
        };
      }

      syncCurrentContents();
      if (!currentContents) {
        return null;
      }

      const selection = currentContents.window.getSelection?.();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return null;
      }

      const range = selection.getRangeAt(0);
      if (!range.toString().trim()) {
        return null;
      }

      return {
        contents: currentContents,
        range: range.cloneRange(),
      };
    };

    const getTtsBlocksFromCurrentSelection = async () => {
      const snapshot = getCurrentSelectionRangeSnapshot();
      if (!snapshot) {
        return [];
      }

      return getTtsBlocksFromSelectionRange(snapshot.contents, snapshot.range);
    };

    const getTtsBlocksFromSelectionStart = async (cfiRange: string) => {
      syncCurrentContents();
      const contents = currentContents;
      if (!contents || !cfiRange) {
        return [];
      }

      const doc = contents.document;
      const candidates = Array.from(doc.body.querySelectorAll<HTMLElement>(ttsBlockSelector));
      if (!candidates.length) {
        return [];
      }

      let range: Range | null = null;
      let selectionText = "";
      try {
        range = await book.getRange(cfiRange);
        selectionText = normalizeText(range?.toString() ?? "");
      } catch {
        range = null;
      }

      const resolvedSelection = findSelectionRangeInCurrentContents(contents, candidates, cfiRange, selectionText);
      if (!resolvedSelection) {
        return [];
      }

      const { range: resolvedRange, selectedIndex } = resolvedSelection;
      const startNode = resolvedRange.startContainer;
      const startOffset = resolveWordStartOffset(startNode, resolvedRange.startOffset ?? 0);

      const viewport = getVisibleViewportMetrics();
      if (
        !isVisibleTtsBlock(
          candidates[selectedIndex].getBoundingClientRect(),
          viewport.width,
          viewport.height,
          viewport.left,
          viewport.top,
        )
      ) {
        return [];
      }

      return buildTtsBlocksFromRangeStart(contents, candidates, selectedIndex, startNode, startOffset);
    };

    const getTtsBlocksFromTarget = async (target: string) => {
      syncCurrentContents();
      const contents = currentContents;
      if (!contents || !target) {
        return [];
      }

      const doc = contents.document;
      const candidates = Array.from(doc.body.querySelectorAll<HTMLElement>(ttsBlockSelector));
      if (!candidates.length) {
        return [];
      }

      const resolveTargetRange = async () => {
        const resolvedTarget = await resolveNavigationTarget(target);

        try {
          const currentRange = contents.range(resolvedTarget);
          if (currentRange && containsNode(doc.body, currentRange.startContainer)) {
            return currentRange;
          }
        } catch {
          // Fall back to book-level range resolution below.
        }

        try {
          const bookRange = await book.getRange(resolvedTarget);
          if (bookRange && containsNode(doc.body, bookRange.startContainer)) {
            return bookRange;
          }
        } catch {
          // Fall back to fragment targeting below.
        }

        const fragment = getNavigationTargetFragment(target);
        if (fragment) {
          const fragmentElement = doc.getElementById(fragment);
          if (fragmentElement) {
            const fragmentRange = doc.createRange();
            fragmentRange.selectNodeContents(fragmentElement);
            fragmentRange.collapse(true);
            return fragmentRange;
          }
        }

        const firstCandidate = candidates[0];
        if (!firstCandidate) {
          return null;
        }

        const chapterStartRange = doc.createRange();
        chapterStartRange.selectNodeContents(firstCandidate);
        chapterStartRange.collapse(true);
        return chapterStartRange;
      };

      const targetRange = await resolveTargetRange();
      if (!targetRange) {
        return [];
      }

      const startNode = targetRange.startContainer;
      const startOffset = resolveWordStartOffset(startNode, targetRange.startOffset ?? 0);
      const startIndex = candidates.findIndex((candidate) => {
        if (containsNode(candidate, startNode)) {
          return true;
        }

        return Boolean(startNode.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING);
      });

      if (startIndex < 0) {
        return [];
      }

      const startCandidate = candidates[startIndex];
      const startCandidateRange = doc.createRange();
      startCandidateRange.selectNodeContents(startCandidate);
      startCandidateRange.setStart(startNode, startOffset);
      const startCandidateText = extractTtsBlockText(startCandidateRange.cloneContents());
      const startCandidateSourceStart = getNormalizedTextOffset(startCandidate, startNode, startOffset);

      let effectiveStartIndex = startIndex;
      if (!isTtsHeadingElement(startCandidate) && startCandidateSourceStart === 0) {
        while (effectiveStartIndex > 0 && isTtsHeadingElement(candidates[effectiveStartIndex - 1])) {
          effectiveStartIndex -= 1;
        }
      }

      return candidates
        .slice(effectiveStartIndex)
        .map((candidate, index) => {
          const cfi = getBlockCfi(contents, candidate);
          const fullText = extractTtsBlockText(candidate);

          if (effectiveStartIndex + index !== startIndex) {
            return {
              cfi,
              locatorText: fullText,
              sourceEnd: fullText.length,
              sourceStart: 0,
              spineItemId: currentSpineItemId,
              tagName: candidate.tagName.toLowerCase(),
              text: fullText,
            };
          }

          return {
            cfi,
            locatorText: fullText,
            sourceEnd: startCandidateSourceStart + startCandidateText.length,
            sourceStart: startCandidateSourceStart,
            spineItemId: currentSpineItemId,
            tagName: candidate.tagName.toLowerCase(),
            text: startCandidateText,
          };
        })
        .filter((block) => Boolean(block.text));
    };

    const handleSelection = async (cfiRange: string, contents: Contents) => {
      currentContents = contents;
      attachSelectionLifecycle(contents);
      syncPagePresentation(contents);
      void applyActiveTtsSegment(activeTtsSegment);

      const liveSnapshot = getSelectionSnapshotFromContents(contents, cfiRange);
      if (liveSnapshot) {
        if (pointerSelecting) {
          pendingSelection = liveSnapshot;
        }

        onSelectionChange?.(liveSnapshot);
        return;
      }

      let range: Range | null = null;
      try {
        range = await book.getRange(cfiRange);
      } catch {
        range = null;
      }
      if (!range) {
        return;
      }

      let ttsBlocks: RuntimeTtsBlock[] | undefined;
      try {
        ttsBlocks = getTtsBlocksFromSelectionRange(contents, range);
      } catch {
        ttsBlocks = undefined;
      }

      const selection = createReaderSelectionSnapshotFromRange({
        contents,
        fallbackCfiRange: cfiRange,
        isReleased: !pointerSelecting,
        range,
        selectionRect: toSelectionViewportRect(contents, range),
        spineItemId: currentSpineItemId,
        ttsBlocks,
      });
      if (!selection) {
        return;
      }

      if (pointerSelecting) {
        pendingSelection = selection;
      }

      onSelectionChange?.(selection);
    };

    const getSelectionSnapshotFromContents = (contents: Contents, fallbackCfiRange = "") => {
      const selection = contents.window.getSelection?.();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return null;
      }

      const range = selection.getRangeAt(0);
      let ttsBlocks: RuntimeTtsBlock[] | undefined;
      try {
        ttsBlocks = getTtsBlocksFromSelectionRange(contents, range);
      } catch {
        ttsBlocks = undefined;
      }

      return createReaderSelectionSnapshotFromRange({
        contents,
        fallbackCfiRange,
        isReleased: !pointerSelecting,
        range,
        selectionRect: toSelectionViewportRect(contents, range),
        spineItemId: currentSpineItemId,
        ttsBlocks,
      });
    };

    const getCurrentSelection = async () => {
      const contents = rendition.getContents();
      const contentList = Array.isArray(contents) ? contents : contents ? [contents] : [];

      for (const entry of contentList) {
        const snapshot = getSelectionSnapshotFromContents(entry);
        if (snapshot) {
          currentContents = entry;
          attachSelectionLifecycle(entry);
          syncPagePresentation(entry);
          return snapshot;
        }
      }

      syncCurrentContents();
      return currentContents ? getSelectionSnapshotFromContents(currentContents) : null;
    };

    const getCurrentSelectionSnapshot = () => {
      const contents = rendition.getContents();
      const contentList = Array.isArray(contents) ? contents : contents ? [contents] : [];

      for (const entry of contentList) {
        const snapshot = getSelectionSnapshotFromContents(entry);
        if (snapshot) {
          currentContents = entry;
          attachSelectionLifecycle(entry);
          syncPagePresentation(entry);
          return snapshot;
        }
      }

      syncCurrentContents();
      return currentContents ? getSelectionSnapshotFromContents(currentContents) : null;
    };

    const clearSelection = async () => {
      pendingSelection = null;
      pointerSelecting = false;

      const contents = rendition.getContents();
      const contentList = Array.isArray(contents) ? contents : contents ? [contents] : [];

      for (const entry of contentList) {
        try {
          entry.window.getSelection?.()?.removeAllRanges();
        } catch {
          // Ignore transient cross-document selection cleanup failures.
        }
      }
    };

    const getCurrentSectionPath = (cfi: string) => {
      if (!currentToc.length || !currentContents || !cfi) {
        return [];
      }

      const viewportPath = findVisibleTocPathForViewport(currentToc, currentSpineItemId, currentContents.document, {
        ...getVisibleViewportMetrics(),
        readingMode: activePreferences.readingMode,
      })
        .map((item) => item.label.trim())
        .filter(Boolean);
      if (viewportPath.length) {
        return viewportPath;
      }

      try {
        const currentRange = currentContents.range(cfi);
        if (!currentRange || !containsNode(currentContents.document.body, currentRange.startContainer)) {
          return [];
        }

        return findActiveTocPathForRange(
          currentToc,
          currentSpineItemId,
          currentRange,
          currentContents.document,
        )
          .map((item) => item.label.trim())
          .filter(Boolean);
      } catch {
        return [];
      }
    };

    const handleRelocated = async (location: Location) => {
      const sequence = ++relocationSequence;
      syncCurrentContents();
      const preferredRestore =
        activePreferences.readingMode === "paginated" ? preferredPaginatedRestore : null;
      const hostResizeRestoreTarget =
        !preferredRestore && activePreferences.readingMode === "paginated" ? activeHostResizeRestoreTarget : null;
      if (preferredRestore) {
        await settlePaginatedPosition(
          activePreferences.readingMode,
          preferredRestore.pageOffset,
          preferredRestore.pageIndex,
        );
      }
      if (activePreferences.readingMode === "scrolled" && preferredScrolledRestore) {
        await settleScrolledPosition(activePreferences.readingMode, preferredScrolledRestore.scrollTop);
      }
      const storedLocation = preferredRestore
        ? await toPreferredStoredLocation(location, preferredRestore.cfi)
        : hostResizeRestoreTarget
          ? await toPreferredStoredLocation(location, hostResizeRestoreTarget)
        : await toStoredLocation(location);
      currentTarget = storedLocation.cfi;
      currentPaginatedResizeTarget =
        activePreferences.readingMode === "paginated"
          ? resolveCurrentPaginatedResizeTarget() || storedLocation.cfi
          : "";
      currentSpineItemId = storedLocation.spineItemId;
      const sectionPath = getCurrentSectionPath(storedLocation.cfi);

      onRelocated?.({
        ...storedLocation,
        ...(sectionPath?.length ? { sectionPath } : {}),
      });
      queueDeferredResolvedLocationProgress(storedLocation, location.start.percentage, sequence);
      if (preferredRestore) {
        preferredPaginatedRestore = null;
      }
      if (preferredScrolledRestore) {
        preferredScrolledRestore = null;
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

    const settleScrolledPosition = async (readingMode: ReadingMode, scrollTop?: number) => {
      const initialContainer = await waitForPaginatedContainerReady(element);
      restoreScrolledViewportOffset(readingMode, initialContainer, scrollTop);
      await waitForLayoutFrame(element.ownerDocument);
      const settledContainer = await waitForPaginatedContainerReady(element);
      restoreScrolledViewportOffset(readingMode, settledContainer, scrollTop);
    };

    const settleScrolledPositionWithProgress = async (
      readingMode: ReadingMode,
      progress?: number,
      fallbackScrollTop?: number,
    ) => {
      const resolveLiveScrollTop = (container: HTMLElement | null) => {
        if (
          typeof progress === "number" &&
          Number.isFinite(progress) &&
          container &&
          Number.isFinite(container.scrollHeight) &&
          Number.isFinite(container.clientHeight)
        ) {
          return Math.max(0, Math.round(progress * Math.max(0, container.scrollHeight - container.clientHeight)));
        }

        return fallbackScrollTop;
      };

      const initialContainer = await waitForPaginatedContainerReady(element);
      restoreScrolledViewportOffset(readingMode, initialContainer, resolveLiveScrollTop(initialContainer));
      await waitForLayoutFrame(element.ownerDocument);
      const settledContainer = await waitForPaginatedContainerReady(element);
      restoreScrolledViewportOffset(readingMode, settledContainer, resolveLiveScrollTop(settledContainer));
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

    const settlePaginatedResizeAnchorPosition = async (
      readingMode: ReadingMode,
      anchor: PaginatedResizeRestoreAnchor | null,
      expectedClientWidth: number,
    ) => {
      if (readingMode !== "paginated" || !anchor) {
        return false;
      }

      const initialContainer = await waitForPaginatedContainerReady(element);
      const initialScrollLeft = resolvePaginatedResizeAnchorRestoreScrollLeft(anchor);
      if (typeof initialScrollLeft !== "number") {
        return false;
      }

      restorePaginatedPageOffset(readingMode, initialContainer, initialScrollLeft);
      await waitForLayoutFrame(element.ownerDocument);
      syncCurrentContents();

      const settledContainer = await waitForSettledPaginatedContainer(element, expectedClientWidth);
      const settledScrollLeft = resolvePaginatedResizeAnchorRestoreScrollLeft(anchor);
      if (typeof settledScrollLeft === "number") {
        restorePaginatedPageOffset(readingMode, settledContainer, settledScrollLeft);
        await waitForLayoutFrame(element.ownerDocument);
        syncCurrentContents();
      }

      return true;
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
        const targetElement = getNearestTtsBlockElement(fragmentElement) ?? fragmentElement;
        return currentContents.cfiFromNode(targetElement);
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
      attachSelectionLifecycle(contents);
      syncCurrentContents();
      if (restoreReadingSurfaceFocusOnRender) {
        restoreReadingSurfaceFocusOnRender = false;
        void restoreReadingSurfaceFocus(currentContents ?? contents);
      }

      if (queuedHostResize && isRenditionReadyForHostResize && !hostResizeSyncInFlight) {
        const nextWidth = queuedHostResize.width;
        const nextHeight = queuedHostResize.height;
        queuedHostResize = null;
        queueHostResizeSync(nextWidth, nextHeight);
      }
    };

    rendition.on("selected", handleSelection);
    rendition.on("relocated", handleRelocated);
    rendition.on("rendered", handleRendered);
    applyCurrentReaderTheme();

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

    if (typeof ResizeObserver !== "undefined") {
      hostResizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry || isDestroyed) {
          return;
        }

        const width = Math.round(entry.contentRect.width);
        const height = Math.round(entry.contentRect.height);
        if (width <= 0 || height <= 0) {
          return;
        }

        if (width === lastObservedHostSize.width && height === lastObservedHostSize.height) {
          return;
        }

        lastObservedHostSize = { height, width };
        queueHostResizeSync(width, height);
      });
      hostResizeObserver.observe(element);
    }

    const navigation = await book.loaded.navigation;
    currentToc = buildTocItems(navigation.toc);
    onTocChange?.(currentToc);
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
    await settleScrolledPosition(flow, initialScrollTop);
    await syncDisplayedLocation();
    currentPaginatedResizeTarget = flow === "paginated" ? resolveCurrentPaginatedResizeTarget() || currentTarget : "";
    isRenditionReadyForHostResize = true;
    const pendingInitialHostResize = queuedHostResize as { height: number; width: number } | null;
    if (pendingInitialHostResize) {
      queuedHostResize = null;
      queueHostResizeSync(pendingInitialHostResize.width, pendingInitialHostResize.height);
    }

    return {
      async applyPreferences(preferences) {
        const preservedPageIndex = readPaginatedPageIndex(activePreferences.readingMode, getPaginatedContainer(element));
        const preservedPageOffset = readPaginatedPageOffset(activePreferences.readingMode, getPaginatedContainer(element));
        activePreferences = {
          ...activePreferences,
          ...preferences,
        };
        applyCurrentReaderTheme();
        await settlePaginatedPosition(activePreferences.readingMode, preservedPageOffset, preservedPageIndex);
        await syncDisplayedLocation();
      },
      destroy() {
        isDestroyed = true;
        isRenditionReadyForHostResize = false;
        resetPaginatedWheelDelta();
        clearActiveTtsRetry();
        clearActiveTtsSegment();
        onPagePresentationChange?.("prose");
        selectionDocumentCleanups.forEach((cleanup) => cleanup());
        selectionDocumentCleanups.clear();
        hostResizeObserver?.disconnect();
        hostResizeObserver = null;
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
          progress: resolveLocationProgressSnapshot(currentTarget, undefined, book.locations),
          ...(getCurrentSectionPath(currentTarget).length ? { sectionPath: getCurrentSectionPath(currentTarget) } : {}),
          scrollTop: readScrolledViewportOffset(activePreferences.readingMode, getPaginatedContainer(element)),
          spineItemId: currentSpineItemId,
          textQuote: await getLocationTextQuote(currentTarget),
        };
      },
      clearSelection,
      getCurrentSelection,
      getCurrentSelectionSnapshot,
      getTtsBlocksFromCurrentSelection,
      getViewportLocationSnapshot() {
        return {
          pageIndex: readPaginatedPageIndex(activePreferences.readingMode, getPaginatedContainer(element)),
          pageOffset: readPaginatedPageOffset(activePreferences.readingMode, getPaginatedContainer(element)),
          scrollTop: readScrolledViewportOffset(activePreferences.readingMode, getPaginatedContainer(element)),
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
      getTtsBlocksFromSelectionStart,
      getTtsBlocksFromTarget,
      getTtsSentenceNoteMetrics() {
        if (!activeTtsElement || !currentContents) {
          return null;
        }

        const frameElement = currentContents.window.frameElement;
        const frameRect = isElementNode(frameElement) ? frameElement.getBoundingClientRect() : null;
        const activeRect = activeTtsElement.getBoundingClientRect();
        const readingBlock = getNearestTtsBlockElement(activeTtsElement) ?? activeTtsElement;
        const readingRect = readingBlock.getBoundingClientRect();

        return {
          activeRect: frameRect ? projectRectIntoViewport(frameRect, activeRect) : readRectMetrics(activeRect),
          readingRect: frameRect ? projectRectIntoViewport(frameRect, readingRect) : readRectMetrics(readingRect),
        };
      },
      async goTo(target) {
        currentTarget = target;
        currentPaginatedResizeTarget = activePreferences.readingMode === "paginated" ? target : "";
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
          currentPaginatedResizeTarget = activePreferences.readingMode === "paginated" ? resolvedTarget : "";
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
      async setTtsPlaybackFollow(enabled) {
        followTtsPlayback = enabled;
        if (enabled && activeTtsSegment) {
          await applyActiveTtsSegment(activeTtsSegment);
        }
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
        currentPaginatedResizeTarget = nextFlow === "paginated" ? currentTarget : "";
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
