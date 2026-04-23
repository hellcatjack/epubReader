import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import type { ReaderAppShellContext } from "../../app/readerAppShellContext";
import type { AnnotationRecord, BookmarkRecord } from "../../lib/types/annotations";
import type { ProgressRecord, TocItem } from "../../lib/types/books";
import type { ReadingMode, SettingsInput, TranslationProvider } from "../../lib/types/settings";
import { aiService, type AiService } from "../ai/aiService";
import { annotationService } from "../annotations/annotationService";
import { getProgress, saveProgress } from "../bookshelf/progressRepository";
import { defaultSettings, getResolvedSettings, saveSettings } from "../settings/settingsRepository";
import {
  settingsUpdatedEventName,
  readRefreshSettingsSnapshot,
  resolvePreferredSettingsSnapshot,
  writeRefreshSettingsSnapshot,
} from "../settings/refreshSettingsSnapshot";
import { createBrowserTtsClient, type BrowserTtsVoice } from "../tts/browserTtsClient";
import { chunkTextSegments, chunkTextSegmentsFromBlocks, type ChunkSegment } from "../tts/chunkText";
import { createTtsQueue } from "../tts/ttsQueue";
import { createPhoneticsService, getEligibleIpaWord } from "./phoneticsService";
import "./reader.css";
import { EpubViewport } from "./EpubViewport";
import { GrammarExplainPopup } from "./GrammarExplainPopup";
import type {
  ActiveTtsSegment,
  EpubViewportRuntime,
  RuntimeRenderHandle,
  RuntimeTtsBlock,
  TtsSentenceNoteMetrics,
} from "./epubRuntime";
import {
  type RefreshProgressSnapshot,
  readRefreshProgressSnapshot,
  resolvePreferredProgress,
  writeRefreshProgressSnapshot,
} from "./refreshProgressSnapshot";
import {
  clearRefreshTtsStartTargetSnapshot,
  readRefreshTtsStartTargetSnapshot,
  writeRefreshTtsStartTargetSnapshot,
} from "./refreshTtsStartTargetSnapshot";
import { LeftRail } from "./LeftRail";
import { ReaderDrawer } from "./ReaderDrawer";
import { RightPanel } from "./RightPanel";
import { SelectionTranslationBubble } from "./SelectionTranslationBubble";
import { SelectionPopover } from "./SelectionPopover";
import { TtsSentenceTranslationNote } from "./TtsSentenceTranslationNote";
import { TopBar } from "./TopBar";
import { getEffectiveReaderPreferences, toReaderPreferences, type ReaderPreferences } from "./readerPreferences";
import { selectionBridge, type ReaderSelection } from "./selectionBridge";
import {
  buildTtsSentenceTranslationCacheKey,
  extractCurrentSpokenSentence,
  isIgnorableSpokenSentence,
} from "./ttsSentenceTranslation";
import { findTocLabelBySpineItemId, findTocPathBySpineItemId, findTocPathByTarget } from "./tocTree";

type ReaderPageProps = {
  ai?: Pick<AiService, "explainSelection" | "translateSelection"> & Partial<Pick<AiService, "defineSelection">>;
  phonetics?: Pick<ReturnType<typeof createPhoneticsService>, "lookupIpa">;
  runtime?: EpubViewportRuntime;
};

type ReaderTtsState = {
  chunkIndex: number;
  currentText: string;
  error: string;
  markerCfi: string;
  markerEndOffset?: number;
  markerIndex: number;
  markerLocatorText?: string;
  markerStartOffset?: number;
  markerText: string;
  mode: "continuous" | "idle" | "selection";
  status: "error" | "idle" | "loading" | "paused" | "playing";
};

type ReaderLocationState = {
  cfi: string;
  pageIndex?: number;
  pageOffset?: number;
  progress: number;
  sectionPath?: string[];
  scrollTop?: number;
  spineItemId: string;
  textQuote: string;
};

type FloatingSelectionTranslation = {
  anchorRect: NonNullable<ReaderSelection["selectionRect"]>;
  translation: string;
};

type SpokenSentenceTranslationNoteState = {
  left: number;
  top: number;
  translation: string;
  width: number;
};

type GrammarExplainPopupState = {
  error: string;
  explanation: string;
  isLoading: boolean;
  selectedText: string;
};

type LocationTargetIntent = "explicit" | "restored";

const continuousTtsChunkOptions = { firstSegmentMax: 280, segmentMax: 500 } as const;
const headingTransitionPauseMs = 350;
const paginatedInitialMarkerFallbackMs = 700;
const recentReleasedSelectionWindowMs = 5000;
const selectionSpeechTranslationFallbackMs = 600;
const tabletStableSelectionTranslateDelayMs = 1000;
const tabletReaderMediaQuery = "(max-width: 1180px)";
const autoReadSelectionEnglishLetterLimit = 30;
const ttsSentenceNoteGapPx = 18;
const ttsSentenceNoteMinimumLanePx = 150;
const ttsSentenceNoteMaximumWidthPx = 280;
const ttsSentenceNoteTabletMaximumWidthPx = 360;
const ttsSentenceNoteTopPaddingPx = 12;
const coarseSectionPathLabels = new Set(["contents", "table of contents"]);

function normalizeSectionPathLabels(sectionPath?: string[]) {
  return (
    sectionPath
      ?.map((label) => label.trim())
      .filter(Boolean)
      .filter((label) => !coarseSectionPathLabels.has(label.toLowerCase())) ?? []
  );
}
const ttsSentenceNoteEstimatedHeightPx = 196;

function getSelectionCacheKey(selection: ReaderSelection | null) {
  const text = selection?.text.trim() ?? "";
  if (!text) {
    return "";
  }

  return [selection?.spineItemId ?? "", selection?.cfiRange ?? "", text].join("::");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function isIpadTouchSelectionBrowser(
  navigatorLike:
    | {
        maxTouchPoints?: number;
        platform?: string;
        userAgent?: string;
      }
    | undefined,
) {
  if (!navigatorLike) {
    return false;
  }

  const userAgent = navigatorLike.userAgent ?? "";
  const platform = navigatorLike.platform ?? "";
  const maxTouchPoints = navigatorLike.maxTouchPoints ?? 0;
  const isIpadFamily =
    /\biPad\b/i.test(userAgent) ||
    ((/\bMacintosh\b/i.test(userAgent) || /\bMacIntel\b/i.test(platform)) && maxTouchPoints > 1);

  if (!isIpadFamily || !/AppleWebKit/i.test(userAgent)) {
    return false;
  }

  return /Version\/.+Safari/i.test(userAgent) || /CriOS/i.test(userAgent) || /EdgiOS/i.test(userAgent);
}

export function resolveTtsSentenceNotePlacement(args: {
  activeRect: TtsSentenceNoteMetrics["activeRect"];
  isTabletLayout: boolean;
  readingRect: TtsSentenceNoteMetrics["readingRect"];
  stageRect: DOMRect;
}) {
  const { activeRect, isTabletLayout, readingRect, stageRect } = args;
  if (stageRect.width <= 0 || stageRect.height <= 0) {
    return null;
  }

  if (!isTabletLayout) {
    const availableLaneWidth = stageRect.right - readingRect.right - ttsSentenceNoteGapPx;
    if (availableLaneWidth >= ttsSentenceNoteMinimumLanePx) {
      const width = Math.min(ttsSentenceNoteMaximumWidthPx, availableLaneWidth);
      const left = Math.max(ttsSentenceNoteGapPx, readingRect.right - stageRect.left + ttsSentenceNoteGapPx);
      const maxTop = Math.max(
        ttsSentenceNoteTopPaddingPx,
        stageRect.height - ttsSentenceNoteEstimatedHeightPx - ttsSentenceNoteTopPaddingPx,
      );
      const top = Math.min(
        Math.max(ttsSentenceNoteTopPaddingPx, activeRect.top - stageRect.top - 8),
        maxTop,
      );

      return { left, top, width };
    }
  }

  const width = Math.min(ttsSentenceNoteTabletMaximumWidthPx, Math.max(220, stageRect.width - ttsSentenceNoteGapPx * 2));
  const minLeft = ttsSentenceNoteGapPx;
  const maxLeft = Math.max(minLeft, stageRect.width - width - ttsSentenceNoteGapPx);
  const readingCenter = (readingRect.left + readingRect.right) / 2 - stageRect.left;
  const left = clamp(readingCenter - width / 2, minLeft, maxLeft);
  const relativeActiveTop = activeRect.top - stageRect.top;
  const relativeActiveBottom = activeRect.bottom - stageRect.top;
  const aboveTop = relativeActiveTop - ttsSentenceNoteEstimatedHeightPx - ttsSentenceNoteGapPx;
  const belowTop = relativeActiveBottom + ttsSentenceNoteGapPx;
  const maxTop = Math.max(
    ttsSentenceNoteTopPaddingPx,
    stageRect.height - ttsSentenceNoteEstimatedHeightPx - ttsSentenceNoteTopPaddingPx,
  );

  const top =
    aboveTop >= ttsSentenceNoteTopPaddingPx
      ? aboveTop
      : clamp(belowTop, ttsSentenceNoteTopPaddingPx, maxTop);

  return { left, top, width };
}

function resolveContinuousTtsSpineItemId(chunks: ChunkSegment[], fallbackSpineItemId: string) {
  return chunks.find((chunk) => chunk.markers.some((marker) => marker.spineItemId))?.markers.find((marker) => marker.spineItemId)
    ?.spineItemId
    ?? fallbackSpineItemId;
}

function useMediaQuery(query: string) {
  const getMatches = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false;
  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQueryList = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mediaQueryList.matches);

    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", handleChange);
      return () => mediaQueryList.removeEventListener("change", handleChange);
    }

    mediaQueryList.addListener(handleChange);
    return () => mediaQueryList.removeListener(handleChange);
  }, [query]);

  return matches;
}

function normalizeSelectionText(text?: string | null) {
  return text?.trim() ?? "";
}

function isSingleWordSelection(text: string) {
  return Boolean(getEligibleIpaWord(text));
}

function sliceChunksFromMarker(chunks: ChunkSegment[], chunkIndex: number, markerIndex: number) {
  const activeChunk = chunks[chunkIndex];
  if (!activeChunk) {
    return chunks;
  }

  const remainingMarkers = activeChunk.markers.slice(Math.max(0, markerIndex));
  if (!remainingMarkers.length) {
    return chunks.slice(chunkIndex + 1);
  }

  let cursor = 0;
  const trimmedChunk: ChunkSegment = {
    markers: remainingMarkers.map((marker) => {
      const start = cursor;
      const end = cursor + marker.text.length;
      cursor = end + 1;
      return {
        ...marker,
        end,
        start,
      };
    }),
    text: remainingMarkers.map((marker) => marker.text).join(" "),
  };

  return [trimmedChunk, ...chunks.slice(chunkIndex + 1)];
}

function getChunkSpineItemId(chunks: ChunkSegment[]) {
  for (const chunk of chunks) {
    for (const marker of chunk.markers) {
      if (marker.spineItemId) {
        return marker.spineItemId;
      }
    }
  }

  return "";
}

function formatTtsError(error: unknown) {
  if (typeof error === "object" && error && "error" in error && typeof error.error === "string") {
    return error.error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Browser speech synthesis error.";
}

function isAutoSpeakableSelection(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  return /[\p{L}\p{N}]/u.test(normalized);
}

function countEnglishLetters(text: string) {
  return text.match(/[A-Za-z]/g)?.length ?? 0;
}

async function getContinuousTtsChunks(
  runtimeHandle: RuntimeRenderHandle,
  readingMode: ReadingMode,
  followPlayback = false,
) {
  try {
    const ttsBlocks = await runtimeHandle.getTtsBlocksFromCurrentLocation?.();
    if (ttsBlocks?.length) {
      return getContinuousTtsChunksFromBlocks(ttsBlocks, readingMode, followPlayback);
    }
  } catch {
    // Fall back to flattened text extraction when paragraph-aware markers are unavailable.
  }

  try {
    const text = await runtimeHandle.getTextFromCurrentLocation();
    return chunkTextSegments(text, continuousTtsChunkOptions);
  } catch {
    return [];
  }
}

function isHeadingTtsBlock(block: RuntimeTtsBlock) {
  return /^h[1-6]$/i.test(block.tagName ?? "");
}

function splitChunkSegmentsIntoSingleMarkerChunks(chunks: ChunkSegment[]) {
  return chunks.flatMap((chunk) =>
    chunk.markers.map((marker, markerIndex) => ({
      markers: [
        {
          ...marker,
          end: marker.text.length,
          start: 0,
        },
      ],
      pauseAfterMs: markerIndex === chunk.markers.length - 1 ? chunk.pauseAfterMs : undefined,
      text: marker.text,
    })),
  );
}

function endsWithAudiblePause(text: string) {
  return /[.!?…:;。！？；：]\s*$/u.test(text.trim());
}

function addTerminalPauseToLastChunk(chunks: ChunkSegment[], pauseAfterMs?: number) {
  if (!chunks.length) {
    return chunks;
  }

  return chunks.map((chunk, index) =>
    index === chunks.length - 1 && !endsWithAudiblePause(chunk.text)
      ? {
          ...chunk,
          pauseAfterMs,
          text: `${chunk.text}.`,
        }
      : index === chunks.length - 1 && pauseAfterMs
        ? {
            ...chunk,
            pauseAfterMs,
          }
        : chunk,
  );
}

function chunkBodyTtsBlocks(blocks: RuntimeTtsBlock[], readingMode: ReadingMode, followPlayback = false) {
  if (readingMode === "paginated") {
    const paginatedChunks = blocks.flatMap((block) => chunkTextSegmentsFromBlocks([block], continuousTtsChunkOptions));
    return followPlayback ? splitChunkSegmentsIntoSingleMarkerChunks(paginatedChunks) : paginatedChunks;
  }

  return chunkTextSegmentsFromBlocks(blocks, continuousTtsChunkOptions);
}

function getContinuousTtsChunksFromBlocks(
  blocks: RuntimeTtsBlock[],
  readingMode: ReadingMode,
  followPlayback = false,
) {
  if (!blocks.length) {
    return [];
  }

  const structuredChunks: ChunkSegment[] = [];
  let bodyStartIndex = 0;
  let index = 0;

  const flushBodyBlocks = (endIndex: number) => {
    if (bodyStartIndex >= endIndex) {
      return;
    }

    structuredChunks.push(...chunkBodyTtsBlocks(blocks.slice(bodyStartIndex, endIndex), readingMode, followPlayback));
  };

  while (index < blocks.length) {
    if (!isHeadingTtsBlock(blocks[index])) {
      index += 1;
      continue;
    }

    flushBodyBlocks(index);

    let headingEndIndex = index + 1;
    while (headingEndIndex < blocks.length && isHeadingTtsBlock(blocks[headingEndIndex])) {
      headingEndIndex += 1;
    }

    for (let headingIndex = index; headingIndex < headingEndIndex; headingIndex += 1) {
      const headingChunks = chunkTextSegmentsFromBlocks([blocks[headingIndex]], continuousTtsChunkOptions);
      const hasFollowingContent = headingIndex < headingEndIndex - 1 || headingEndIndex < blocks.length;
      structuredChunks.push(
        ...(hasFollowingContent ? addTerminalPauseToLastChunk(headingChunks, headingTransitionPauseMs) : headingChunks),
      );
    }

    index = headingEndIndex;
    bodyStartIndex = headingEndIndex;
  }

  flushBodyBlocks(blocks.length);
  return structuredChunks.length ? structuredChunks : chunkBodyTtsBlocks(blocks, readingMode, followPlayback);
}

async function getContinuousTtsChunksFromTarget(
  runtimeHandle: RuntimeRenderHandle,
  readingMode: ReadingMode,
  target: string,
  followPlayback = false,
) {
  if (!target.trim()) {
    return [];
  }

  try {
    const ttsBlocks = await runtimeHandle.getTtsBlocksFromTarget?.(target);
    if (ttsBlocks?.length) {
      return getContinuousTtsChunksFromBlocks(ttsBlocks, readingMode, followPlayback);
    }
  } catch {
    return [];
  }

  return [];
}

async function getContinuousTtsChunksFromSelection(
  runtimeHandle: RuntimeRenderHandle,
  readingMode: ReadingMode,
  selection: ReaderSelection | null,
  followPlayback = false,
) {
  const cfiRange = selection?.cfiRange?.trim() ?? "";
  if (!cfiRange) {
    return [];
  }

  try {
    const ttsBlocks = await runtimeHandle.getTtsBlocksFromSelectionStart?.(cfiRange);
    if (ttsBlocks?.length) {
      return getContinuousTtsChunksFromBlocks(ttsBlocks, readingMode, followPlayback);
    }
  } catch {
    return [];
  }

  return [];
}

export function ReaderPage({ ai = aiService, phonetics, runtime }: ReaderPageProps) {
  const { bookId } = useParams<{ bookId: string }>();
  const shellContext = useOutletContext<ReaderAppShellContext | null>() ?? null;
  const isTabletLayout = useMediaQuery(tabletReaderMediaQuery);
  const supportsStableTouchSelectionTranslate =
    isTabletLayout || isIpadTouchSelectionBrowser(typeof navigator !== "undefined" ? navigator : undefined);
  const [initialCfi, setInitialCfi] = useState<string>();
  const [initialProgress, setInitialProgress] = useState<ProgressRecord | null>(null);
  const [isProgressReady, setIsProgressReady] = useState(!bookId);
  const [locationTarget, setLocationTarget] = useState<string>();
  const [locationTargetIntent, setLocationTargetIntent] = useState<LocationTargetIntent>("restored");
  const [explicitLocationTarget, setExplicitLocationTarget] = useState<string>();
  const [preferExactViewportTarget, setPreferExactViewportTarget] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [currentSpineItemId, setCurrentSpineItemId] = useState("");
  const [readerStatus, setReaderStatus] = useState(
    bookId ? "Restoring reading position..." : "Open a book from the shelf to start reading.",
  );
  const [selectedSelection, setSelectedSelection] = useState<ReaderSelection | null>(null);
  const [aiIpa, setAiIpa] = useState("");
  const [translation, setTranslation] = useState("");
  const [translationError, setTranslationError] = useState("");
  const [englishDefinition, setEnglishDefinition] = useState("");
  const [floatingSelectionTranslation, setFloatingSelectionTranslation] = useState<FloatingSelectionTranslation | null>(null);
  const [spokenSentenceTranslation, setSpokenSentenceTranslation] = useState("");
  const [ttsSentenceNoteMetrics, setTtsSentenceNoteMetrics] = useState<TtsSentenceNoteMetrics | null>(null);
  const [ttsSentenceTranslationNote, setTtsSentenceTranslationNote] = useState<SpokenSentenceTranslationNoteState | null>(
    null,
  );
  const [grammarExplainPopup, setGrammarExplainPopup] = useState<GrammarExplainPopupState | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [currentLocation, setCurrentLocation] = useState<ReaderLocationState>({
    cfi: "",
    pageIndex: undefined,
    pageOffset: undefined,
    progress: 0,
    sectionPath: undefined,
    scrollTop: undefined,
    spineItemId: "",
    textQuote: "",
  });
  const [noteDraft, setNoteDraft] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [runtimeHandle, setRuntimeHandle] = useState<RuntimeRenderHandle | null>(null);
  const [visibleAnnotations, setVisibleAnnotations] = useState<AnnotationRecord[]>([]);
  const [isContentsDrawerOpen, setIsContentsDrawerOpen] = useState(false);
  const [isToolsDrawerOpen, setIsToolsDrawerOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsInput>(defaultSettings);
  const [isSettingsReady, setIsSettingsReady] = useState(false);
  const [ttsVoices, setTtsVoices] = useState<BrowserTtsVoice[]>([]);
  const [ttsStartReady, setTtsStartReady] = useState(false);
  const [ttsState, setTtsState] = useState<ReaderTtsState>({
    chunkIndex: -1,
    currentText: "",
    error: "",
    markerCfi: "",
    markerIndex: -1,
    markerText: "",
    mode: "idle",
    status: "idle",
  });
  const settingsDirtyRef = useRef(false);
  const settingsRef = useRef<SettingsInput>(defaultSettings);
  const currentLocationRef = useRef<ReaderLocationState>({
    cfi: "",
    pageIndex: undefined,
    pageOffset: undefined,
    progress: 0,
    sectionPath: undefined,
    scrollTop: undefined,
    spineItemId: "",
    textQuote: "",
  });
  const lastResolvedSectionPathRef = useRef<{ path: string[]; spineItemId: string } | null>(null);
  const runtimeHandleValueRef = useRef<RuntimeRenderHandle | null>(null);
  const translationRequestVersionRef = useRef(0);
  const explanationRequestVersionRef = useRef(0);
  const lastAutoTranslatedSelectionKeyRef = useRef("");
  const suppressedTabletAutoTranslateSelectionKeyRef = useRef("");
  const activeSelectionSpeechRequestRef = useRef(0);
  const continuousSpineItemIdRef = useRef("");
  const continuousChunksRef = useRef<ChunkSegment[]>([]);
  const continuousSessionActiveRef = useRef(false);
  const continuousAdvanceInFlightRef = useRef(false);
  const continuousSpineSyncPendingRef = useRef("");
  const lastContinuousMarkerCfiRef = useRef("");
  const lastContinuousTextRef = useRef("");
  const lastAutoPagedCfiRef = useRef("");
  const pendingPointerStartSelectionRef = useRef<ReaderSelection | null>(null);
  const pendingPointerStartBlocksPromiseRef = useRef<Promise<RuntimeTtsBlock[]> | null>(null);
  const cachedSelectionBlocksKeyRef = useRef("");
  const cachedSelectionBlocksPromiseRef = useRef<Promise<RuntimeTtsBlock[]> | null>(null);
  const lastReleasedSelectionRef = useRef<ReaderSelection | null>(null);
  const lastReleasedSelectionAtRef = useRef(0);
  const pendingTtsStartTargetRef = useRef("");
  const ttsReadinessRequestRef = useRef(0);
  const appliedPreferencesRuntimeRef = useRef<RuntimeRenderHandle | null>(null);
  const appliedPreferencesSignatureRef = useRef("");
  const browserTtsClientRef = useRef(createBrowserTtsClient());
  const phoneticsServiceRef = useRef(phonetics ?? createPhoneticsService());
  const ttsQueueRef = useRef<ReturnType<typeof createTtsQueue> | null>(null);
  const spokenSentenceTranslationCacheRef = useRef(new Map<string, string>());
  const spokenSentenceTranslationRequestRef = useRef(0);
  const readerStageRef = useRef<HTMLElement | null>(null);

  function resolveSectionPathForLocation(
    nextLocation: {
      cfi: string;
      sectionPath?: string[];
      spineItemId?: string;
    },
    fallbackLocation: Pick<ReaderLocationState, "cfi" | "sectionPath" | "spineItemId">,
  ) {
    const nextSectionPath = nextLocation.sectionPath?.map((label) => label.trim()).filter(Boolean) ?? [];
    const fallbackSectionPath = fallbackLocation.sectionPath?.map((label) => label.trim()).filter(Boolean) ?? [];
    const resolvedSpineItemId = (nextLocation.spineItemId ?? fallbackLocation.spineItemId ?? "").trim();
    const retainedSectionPath =
      fallbackSectionPath.length > 0
        ? fallbackSectionPath
        : resolvedSpineItemId && lastResolvedSectionPathRef.current?.spineItemId === resolvedSpineItemId
          ? lastResolvedSectionPathRef.current.path
          : [];

    const rememberResolvedSectionPath = (sectionPath?: string[]) => {
      const normalizedSectionPath = sectionPath?.map((label) => label.trim()).filter(Boolean) ?? [];
      if (!normalizedSectionPath.length || !resolvedSpineItemId) {
        return sectionPath;
      }

      lastResolvedSectionPathRef.current = {
        path: normalizedSectionPath,
        spineItemId: resolvedSpineItemId,
      };
      return normalizedSectionPath;
    };

    if (nextSectionPath.length) {
      if ((nextLocation.spineItemId ?? "") === fallbackLocation.spineItemId && retainedSectionPath.length) {
        const normalizedNextSectionPath = normalizeSectionPathLabels(nextSectionPath);
        const normalizedFallbackSectionPath = normalizeSectionPathLabels(retainedSectionPath);
        const nextSectionPathIsCoarserAncestor =
          normalizedNextSectionPath.length > 0 &&
          normalizedNextSectionPath.length < normalizedFallbackSectionPath.length &&
          normalizedNextSectionPath.every((label, index) => label === normalizedFallbackSectionPath[index]);

        if (nextSectionPathIsCoarserAncestor) {
          return rememberResolvedSectionPath(retainedSectionPath);
        }
      }

      return rememberResolvedSectionPath(nextSectionPath);
    }

    if (!retainedSectionPath.length) {
      return undefined;
    }

    if (
      nextLocation.cfi === fallbackLocation.cfi ||
      ((nextLocation.spineItemId ?? "") && (nextLocation.spineItemId ?? "") === fallbackLocation.spineItemId)
    ) {
      return rememberResolvedSectionPath(retainedSectionPath);
    }

    return undefined;
  }

  function ensureTtsQueue() {
    if (!ttsQueueRef.current) {
      ttsQueueRef.current = createTtsQueue({
        client: browserTtsClientRef.current,
        onStateChange(nextState) {
          setTtsState((currentState) => ({
            ...currentState,
            chunkIndex: nextState.chunkIndex,
            currentText: nextState.currentText,
            markerCfi: nextState.markerCfi,
            markerEndOffset: nextState.markerEndOffset,
            markerIndex: nextState.markerIndex,
            markerLocatorText: nextState.markerLocatorText,
            markerStartOffset: nextState.markerStartOffset,
            markerText: nextState.markerText,
            mode:
              nextState.status === "idle" ? "idle" : currentState.mode === "idle" ? "continuous" : currentState.mode,
            status: nextState.status,
          }));
        },
      });
    }

    return ttsQueueRef.current;
  }

  const activeContinuousTtsSegment = useMemo<ActiveTtsSegment | null>(() => {
    if (!(ttsState.mode === "continuous" && ttsState.status !== "idle" && ttsState.markerText && continuousSpineItemIdRef.current)) {
      return null;
    }

    return {
      cfi: ttsState.markerCfi || undefined,
      locatorText: ttsState.markerLocatorText || undefined,
      spineItemId: continuousSpineItemIdRef.current,
      text: ttsState.markerText,
      ...(typeof ttsState.markerStartOffset === "number" && ttsState.markerStartOffset >= 0
        ? { startOffset: ttsState.markerStartOffset }
        : {}),
      ...(typeof ttsState.markerEndOffset === "number" && ttsState.markerEndOffset >= 0
        ? { endOffset: ttsState.markerEndOffset }
        : {}),
    };
  }, [
    ttsState.markerCfi,
    ttsState.markerEndOffset,
    ttsState.markerLocatorText,
    ttsState.markerStartOffset,
    ttsState.markerText,
    ttsState.mode,
    ttsState.status,
  ]);
  const currentSpokenSentence = useMemo(() => {
    if (!activeContinuousTtsSegment || ttsState.mode !== "continuous" || ttsState.status === "idle") {
      return "";
    }

    const sentence = extractCurrentSpokenSentence({
      fallbackText: ttsState.currentText || ttsState.markerText,
      locatorText: ttsState.markerLocatorText || ttsState.currentText,
      startOffset: ttsState.markerStartOffset,
    });
    return isIgnorableSpokenSentence(sentence) ? "" : sentence;
  }, [
    activeContinuousTtsSegment,
    ttsState.currentText,
    ttsState.markerLocatorText,
    ttsState.markerStartOffset,
    ttsState.markerText,
    ttsState.mode,
    ttsState.status,
  ]);
  const currentSpokenSentenceCacheKey =
    bookId && (activeContinuousTtsSegment?.spineItemId || currentSpineItemId) && currentSpokenSentence
      ? buildTtsSentenceTranslationCacheKey({
          bookId,
          sentence: currentSpokenSentence,
          spineItemId: activeContinuousTtsSegment?.spineItemId || currentSpineItemId,
        })
      : "";

  useEffect(() => {
    let cancelled = false;

    if (!bookId) {
      pendingTtsStartTargetRef.current = "";
      setInitialCfi(undefined);
      setInitialProgress(null);
      setIsProgressReady(true);
      setLocationTarget(undefined);
      setLocationTargetIntent("restored");
      setExplicitLocationTarget(undefined);
      setPreferExactViewportTarget(false);
      setCurrentLocation({
        cfi: "",
        pageIndex: undefined,
        pageOffset: undefined,
        progress: 0,
        sectionPath: undefined,
        scrollTop: undefined,
        spineItemId: "",
        textQuote: "",
      });
      setCurrentSpineItemId("");
      setReaderStatus("Open a book from the shelf to start reading.");
      return;
    }

    setIsProgressReady(false);
    pendingTtsStartTargetRef.current = readRefreshTtsStartTargetSnapshot(bookId);
    setInitialCfi(undefined);
    setInitialProgress(null);
    setLocationTarget(undefined);
    setLocationTargetIntent("restored");
    setExplicitLocationTarget(undefined);
    setPreferExactViewportTarget(false);
    setCurrentLocation({
      cfi: "",
      pageIndex: undefined,
      pageOffset: undefined,
      progress: 0,
      sectionPath: undefined,
      scrollTop: undefined,
      spineItemId: "",
      textQuote: "",
    });
    setCurrentSpineItemId("");
    setReaderStatus("Restoring reading position...");

    const refreshSnapshot = readRefreshProgressSnapshot(bookId);
    const applyResolvedProgress = (progress: RefreshProgressSnapshot | ProgressRecord | null) => {
      setInitialProgress(progress ?? null);
      setInitialCfi(progress?.cfi);
      setLocationTarget(progress?.cfi);
      setLocationTargetIntent("restored");
      setExplicitLocationTarget(undefined);
      setPreferExactViewportTarget(false);
      setCurrentLocation({
        cfi: progress?.cfi ?? "",
        pageIndex: progress?.pageIndex,
        pageOffset: progress?.pageOffset,
        progress: progress?.progress ?? 0,
        sectionPath: progress ? resolveSectionPathForLocation(progress, currentLocationRef.current) : undefined,
        scrollTop: progress?.scrollTop,
        spineItemId: progress?.spineItemId ?? "",
        textQuote: progress?.textQuote ?? "",
      });
      setCurrentSpineItemId(progress?.spineItemId ?? "");
    };

    if (refreshSnapshot) {
      applyResolvedProgress(refreshSnapshot);
    }

    void getProgress(bookId)
      .then((progress) => {
        if (cancelled) {
          return;
        }

        applyResolvedProgress(resolvePreferredProgress(refreshSnapshot, progress ?? null));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        applyResolvedProgress(refreshSnapshot ?? null);
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setIsProgressReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

  useEffect(() => {
    if (!isTabletLayout) {
      setIsContentsDrawerOpen(false);
      setIsToolsDrawerOpen(false);
    }
  }, [isTabletLayout]);

  useEffect(() => {
    runtimeHandleValueRef.current = runtimeHandle;
  }, [runtimeHandle]);

  useEffect(() => {
    let cancelled = false;
    const refreshSnapshot = readRefreshSettingsSnapshot();

    if (refreshSnapshot && !settingsDirtyRef.current) {
      setSettings(refreshSnapshot.settings);
      setIsSettingsReady(true);
    }

    void getResolvedSettings()
      .then((nextSettings) => {
        if (cancelled) {
          return;
        }

        if (!settingsDirtyRef.current) {
          setSettings(resolvePreferredSettingsSnapshot(refreshSnapshot, { ...defaultSettings, ...nextSettings }));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSettingsReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleSettingsUpdated(event: Event) {
      const nextSettings = (event as CustomEvent<{ settings?: SettingsInput }>).detail?.settings;
      if (!nextSettings) {
        return;
      }

      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      setIsSettingsReady(true);
    }

    window.addEventListener(settingsUpdatedEventName, handleSettingsUpdated);
    return () => {
      window.removeEventListener(settingsUpdatedEventName, handleSettingsUpdated);
    };
  }, []);

  useEffect(() => {
    function handlePaginatedArrowKey(event: KeyboardEvent) {
      if (settings.readingMode !== "paginated" || !runtimeHandle) {
        return;
      }

      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      const target = event.target;
      const targetElement = target instanceof Element ? target : null;
      const textInputTarget = target instanceof HTMLElement ? target : null;
      const tagName = textInputTarget?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select" || textInputTarget?.isContentEditable) {
        return;
      }

      if (targetElement?.closest(".reader-topbar")) {
        return;
      }

      const activeElement = document.activeElement;
      const readingSurfaceFocused =
        Boolean(activeElement instanceof HTMLIFrameElement && activeElement.closest(".epub-root")) ||
        Boolean(activeElement instanceof Element && activeElement.closest(".epub-root"));
      if (!readingSurfaceFocused) {
        return;
      }

      event.preventDefault();
      if (event.key === "ArrowRight") {
        void runtimeHandle.next();
        return;
      }

      void runtimeHandle.prev();
    }

    window.addEventListener("keydown", handlePaginatedArrowKey);
    return () => window.removeEventListener("keydown", handlePaginatedArrowKey);
  }, [runtimeHandle, settings.readingMode]);

  useEffect(() => {
    const requestId = ++ttsReadinessRequestRef.current;

    if (!runtimeHandle) {
      setTtsStartReady(false);
      setTtsVoices([]);
      return;
    }

    setTtsStartReady(false);

    void Promise.all([
      getContinuousTtsChunks(runtimeHandle, settings.readingMode, settings.ttsFollowPlayback),
      browserTtsClientRef.current.getVoices(),
    ])
      .then(([chunks, voices]) => {
        if (ttsReadinessRequestRef.current !== requestId) {
          return;
        }

        setTtsVoices(voices);

        if (!voices.length) {
          setTtsStartReady(false);
          setTtsState({
            chunkIndex: -1,
            currentText: "",
            error: "No compatible English voices detected.",
            markerCfi: "",
            markerIndex: -1,
            markerText: "",
            mode: "idle",
            status: "error",
          });
          return;
        }

        if (!settings.ttsVoice || !voices.some((voice) => voice.id === settings.ttsVoice)) {
          const fallbackVoice = voices.find((voice) => voice.isDefault)?.id ?? voices[0]?.id ?? "";
          setSettings((current) => ({
            ...current,
            ttsVoice: fallbackVoice,
          }));
        }

        if (!chunks.length) {
          setTtsStartReady(false);
          return;
        }

        setTtsStartReady(true);
        setTtsState((currentState) =>
          currentState.mode === "idle"
            ? {
                chunkIndex: -1,
                currentText: "",
                error: "",
                markerCfi: "",
                markerIndex: -1,
                markerText: "",
                mode: "idle",
                status: "idle",
              }
            : currentState,
        );
      })
      .catch(() => {
        if (ttsReadinessRequestRef.current !== requestId) {
          return;
        }

        setTtsVoices([]);
        setTtsStartReady(false);
        setTtsState((currentState) =>
          currentState.mode === "idle"
            ? {
                chunkIndex: -1,
                currentText: "",
                error: "Browser speech synthesis unavailable.",
                markerCfi: "",
                markerIndex: -1,
                markerText: "",
                mode: "idle",
                status: "error",
              }
            : currentState,
        );
      });
  }, [currentLocation.cfi, currentLocation.spineItemId, runtimeHandle, settings.ttsVoice]);

  useEffect(() => {
    const unsubscribe = selectionBridge.subscribe((selection) => {
      setSelectedSelection(selection);

      if (!selection?.text.trim() || selection?.isReleased === false) {
        setFloatingSelectionTranslation(null);
      }

      if (selection?.text.trim()) {
        lastReleasedSelectionRef.current = selection;
        lastReleasedSelectionAtRef.current = Date.now();
        cachedSelectionBlocksKeyRef.current = getSelectionCacheKey(selection);
        cachedSelectionBlocksPromiseRef.current = runtimeHandleValueRef.current?.getTtsBlocksFromCurrentSelection?.() ?? null;
      }

      if (!selection?.text.trim()) {
        lastAutoTranslatedSelectionKeyRef.current = "";
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isTabletLayout) {
      setFloatingSelectionTranslation(null);
    }
  }, [isTabletLayout]);

  useEffect(() => {
    if (selectedSelection?.isReleased === false) {
      setFloatingSelectionTranslation(null);
    }
  }, [selectedSelection?.cfiRange, selectedSelection?.isReleased, selectedSelection?.text]);

  useEffect(() => {
    if (!activeContinuousTtsSegment || !runtimeHandle?.getTtsSentenceNoteMetrics) {
      setTtsSentenceNoteMetrics(null);
      return;
    }

    let frameId = 0;
    const syncMetrics = () => {
      const nextMetrics = runtimeHandle.getTtsSentenceNoteMetrics?.() ?? null;
      setTtsSentenceNoteMetrics((current) =>
        current &&
        nextMetrics &&
        current.activeRect.top === nextMetrics.activeRect.top &&
        current.activeRect.left === nextMetrics.activeRect.left &&
        current.activeRect.right === nextMetrics.activeRect.right &&
        current.activeRect.bottom === nextMetrics.activeRect.bottom &&
        current.readingRect.left === nextMetrics.readingRect.left &&
        current.readingRect.right === nextMetrics.readingRect.right &&
        current.readingRect.top === nextMetrics.readingRect.top &&
        current.readingRect.bottom === nextMetrics.readingRect.bottom
          ? current
          : nextMetrics
      );
    };

    frameId = window.requestAnimationFrame(syncMetrics);
    window.addEventListener("resize", syncMetrics);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", syncMetrics);
    };
  }, [activeContinuousTtsSegment, runtimeHandle, ttsState.markerCfi, ttsState.markerText]);

  useEffect(() => {
    if (!currentSpokenSentenceCacheKey || !currentSpokenSentence) {
      setSpokenSentenceTranslation("");
      return;
    }

    const cached = spokenSentenceTranslationCacheRef.current.get(currentSpokenSentenceCacheKey);
    if (cached) {
      setSpokenSentenceTranslation(cached);
      return;
    }

    const requestVersion = ++spokenSentenceTranslationRequestRef.current;
    setSpokenSentenceTranslation("");

    void ai
      .translateSelection(currentSpokenSentence, {
        targetLanguage: settings.targetLanguage || navigator.language || "zh-CN",
      })
      .then((result) => {
        if (spokenSentenceTranslationRequestRef.current !== requestVersion) {
          return;
        }

        spokenSentenceTranslationCacheRef.current.set(currentSpokenSentenceCacheKey, result);
        setSpokenSentenceTranslation(result);
      })
      .catch(() => {
        if (spokenSentenceTranslationRequestRef.current !== requestVersion) {
          return;
        }

        setSpokenSentenceTranslation("");
      });
  }, [ai, currentSpokenSentence, currentSpokenSentenceCacheKey, settings.targetLanguage]);

  useEffect(() => {
    if (
      !activeContinuousTtsSegment ||
      ttsState.status === "idle" ||
      !spokenSentenceTranslation.trim() ||
      !ttsSentenceNoteMetrics ||
      !readerStageRef.current
    ) {
      setTtsSentenceTranslationNote(null);
      return;
    }

    const syncNote = () => {
      const stageRect = readerStageRef.current?.getBoundingClientRect();
      if (!stageRect) {
        setTtsSentenceTranslationNote(null);
        return;
      }

      const placement = resolveTtsSentenceNotePlacement({
        activeRect: ttsSentenceNoteMetrics.activeRect,
        isTabletLayout,
        readingRect: ttsSentenceNoteMetrics.readingRect,
        stageRect,
      });
      if (!placement) {
        setTtsSentenceTranslationNote(null);
        return;
      }

      setTtsSentenceTranslationNote((current) =>
        current &&
        current.left === placement.left &&
        current.top === placement.top &&
        current.translation === spokenSentenceTranslation &&
        current.width === placement.width
          ? current
          : {
              left: placement.left,
              top: placement.top,
              translation: spokenSentenceTranslation,
              width: placement.width,
            },
      );
    };

    syncNote();
    window.addEventListener("resize", syncNote);
    return () => window.removeEventListener("resize", syncNote);
  }, [activeContinuousTtsSegment, isTabletLayout, spokenSentenceTranslation, ttsSentenceNoteMetrics, ttsState.status]);

  useEffect(() => {
    if (!isTabletLayout || !runtimeHandle?.getCurrentSelectionSnapshot) {
      return;
    }

    const snapshot = runtimeHandle.getCurrentSelectionSnapshot();
    if (!snapshot?.text.trim()) {
      return;
    }

    suppressedTabletAutoTranslateSelectionKeyRef.current = getSelectionCacheKey(snapshot);
    selectionBridge.publish(snapshot);
  }, [isTabletLayout, runtimeHandle]);

  useEffect(() => {
    if (!floatingSelectionTranslation) {
      return undefined;
    }

    const dismiss = () => setFloatingSelectionTranslation(null);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("pointerdown", dismiss, true);

    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("pointerdown", dismiss, true);
    };
  }, [floatingSelectionTranslation]);

  useEffect(() => {
    if (isContentsDrawerOpen || isToolsDrawerOpen) {
      setFloatingSelectionTranslation(null);
    }
  }, [isContentsDrawerOpen, isToolsDrawerOpen]);

  function resolveSelectionForFloatingBubble(selection: ReaderSelection | null | undefined, expectedText: string) {
    const normalizedExpectedText = normalizeSelectionText(expectedText);
    if (!normalizedExpectedText) {
      return null;
    }

    const selectionBridgeSnapshot = selectionBridge.read();
    const runtimeSnapshot = runtimeHandleValueRef.current?.getCurrentSelectionSnapshot?.() ?? null;
    const recentReleasedSelection =
      Date.now() - lastReleasedSelectionAtRef.current <= recentReleasedSelectionWindowMs ? lastReleasedSelectionRef.current : null;
    const expectedSelectionKey = getSelectionCacheKey(selection ?? null);
    const recentSelectionKey = expectedSelectionKey ? expectedSelectionKey : getSelectionCacheKey(recentReleasedSelection);

    const candidates = [selection, runtimeSnapshot, selectionBridgeSnapshot, recentReleasedSelection].filter(
      (candidate): candidate is ReaderSelection => Boolean(candidate),
    );

    return (
      candidates.find((candidate) => {
        if (!candidate.selectionRect) {
          return false;
        }

        const candidateText = normalizeSelectionText(candidate.text);
        if (candidateText !== normalizedExpectedText) {
          return false;
        }

        if (!recentSelectionKey) {
          return true;
        }

        const candidateKey = getSelectionCacheKey(candidate);
        return candidateKey ? candidateKey === recentSelectionKey : true;
      }) ?? null
    );
  }

  useEffect(() => {
    const nextSelectionText = selectedSelection?.text.trim() ?? "";
    const bubbleSelection = resolveSelectionForFloatingBubble(selectedSelection, nextSelectionText);
    const selectionRect = bubbleSelection?.selectionRect;
    const shouldShowBubble = isTabletLayout || !isSingleWordSelection(nextSelectionText);
    if (
      selectedSelection?.isReleased === false ||
      !shouldShowBubble ||
      !translation.trim() ||
      !selectionRect ||
      !nextSelectionText
    ) {
      return;
    }

    setFloatingSelectionTranslation((current) => {
      if (
        current &&
        current.translation === translation &&
        current.anchorRect.top === selectionRect.top &&
        current.anchorRect.left === selectionRect.left &&
        current.anchorRect.width === selectionRect.width &&
        current.anchorRect.height === selectionRect.height
      ) {
        return current;
      }

      return {
        anchorRect: selectionRect,
        translation,
      };
    });
  }, [isTabletLayout, selectedSelection, translation]);

  useEffect(() => {
    const nextText = selectedSelection?.text.trim() ?? "";
    if (!nextText || isSingleWordSelection(nextText)) {
      return;
    }

    setTranslation("");
    setTranslationError("");
    setEnglishDefinition("");
    setAiIpa("");
  }, [selectedSelection?.cfiRange, selectedSelection?.isReleased, selectedSelection?.text]);

  useEffect(() => {
    const nextText = selectedSelection?.text.trim() ?? "";
    if (!nextText) {
      return;
    }

    const selectionKey = [selectedSelection?.spineItemId ?? "", selectedSelection?.cfiRange ?? "", nextText].join(
      "::",
    );

    if (suppressedTabletAutoTranslateSelectionKeyRef.current === selectionKey) {
      suppressedTabletAutoTranslateSelectionKeyRef.current = "";
      return;
    }

    if (selectedSelection?.isReleased === false) {
      if (!supportsStableTouchSelectionTranslate) {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        const bridgeSelection = selectionBridge.read();
        const bridgeSelectionKey = getSelectionCacheKey(bridgeSelection);
        if (
          bridgeSelectionKey !== selectionKey ||
          bridgeSelection?.isReleased !== false ||
          lastAutoTranslatedSelectionKeyRef.current === selectionKey
        ) {
          return;
        }

        const runtimeSelection = runtimeHandleValueRef.current?.getCurrentSelectionSnapshot?.() ?? null;
        const latestSelection =
          getSelectionCacheKey(runtimeSelection) === selectionKey && runtimeSelection?.selectionRect
            ? runtimeSelection
            : bridgeSelection;
        const latestText = latestSelection?.text.trim() ?? "";

        if (
          !latestText ||
          !latestSelection?.selectionRect ||
          getSelectionCacheKey(latestSelection) !== selectionKey
        ) {
          return;
        }

        lastAutoTranslatedSelectionKeyRef.current = selectionKey;
        void requestTranslation(latestText, latestSelection?.sentenceContext, latestSelection);
      }, tabletStableSelectionTranslateDelayMs);

      return () => window.clearTimeout(timeoutId);
    }

    if (lastAutoTranslatedSelectionKeyRef.current === selectionKey) {
      return;
    }

    if (
      isAutoSpeakableSelection(nextText) &&
      countEnglishLetters(nextText) <= autoReadSelectionEnglishLetterLimit
    ) {
      let isActive = true;
      let translationStarted = false;

      const beginTranslation = () => {
        if (!isActive || translationStarted) {
          return;
        }

        const currentSelection =
          selectionBridge.read() ?? runtimeHandleValueRef.current?.getCurrentSelectionSnapshot?.() ?? selectedSelection;
        if (getSelectionCacheKey(currentSelection) !== selectionKey) {
          return;
        }

        translationStarted = true;
        lastAutoTranslatedSelectionKeyRef.current = selectionKey;
        void requestTranslation(nextText, selectedSelection?.sentenceContext, selectedSelection);
      };

      const translationFallbackId = window.setTimeout(beginTranslation, selectionSpeechTranslationFallbackMs);
      void startSelectionSpeech(nextText, {
        onPlaybackError: () => {
          window.clearTimeout(translationFallbackId);
          beginTranslation();
        },
        onPlaybackStart: () => {
          window.clearTimeout(translationFallbackId);
          beginTranslation();
        },
      });

      return () => {
        isActive = false;
        window.clearTimeout(translationFallbackId);
      };
    }

    lastAutoTranslatedSelectionKeyRef.current = selectionKey;
    void requestTranslation(nextText, selectedSelection?.sentenceContext, selectedSelection);
  }, [selectedSelection, supportsStableTouchSelectionTranslate]);

  useEffect(() => {
    if (!floatingSelectionTranslation) {
      return;
    }

    setFloatingSelectionTranslation(null);
  }, [currentLocation.cfi, currentLocation.pageIndex, currentLocation.pageOffset, currentLocation.scrollTop, settings.readingMode]);

  useEffect(() => {
    if (!bookId || !currentSpineItemId) {
      setVisibleAnnotations([]);
      return;
    }

    void annotationService.queryVisible(bookId, currentSpineItemId).then(setVisibleAnnotations);
  }, [bookId, currentSpineItemId]);

  useEffect(() => {
    if (!bookId) {
      setBookmarks([]);
      return;
    }

    void annotationService
      .listByBook(bookId)
      .then((records) => records.filter((record): record is BookmarkRecord => record.kind === "bookmark"))
      .then(setBookmarks);
  }, [bookId]);

  useEffect(() => {
    const pendingSpineItemId = continuousSpineSyncPendingRef.current;
    if (pendingSpineItemId) {
      if (currentSpineItemId === pendingSpineItemId) {
        continuousSpineSyncPendingRef.current = "";
      } else {
        return;
      }
    }

    if (
      ttsState.mode === "continuous" &&
      ttsState.status !== "idle" &&
      continuousSpineItemIdRef.current &&
      currentSpineItemId &&
      currentSpineItemId !== continuousSpineItemIdRef.current
    ) {
      ttsQueueRef.current?.stop();
      continuousSessionActiveRef.current = false;
      continuousAdvanceInFlightRef.current = false;
      continuousSpineItemIdRef.current = "";
      setTtsState({
        chunkIndex: -1,
        currentText: "",
        error: "Reading position changed.",
        markerCfi: "",
        markerIndex: -1,
        markerText: "",
        mode: "idle",
        status: "idle",
      });
    }
  }, [currentSpineItemId, ttsState.mode, ttsState.status]);

  useEffect(() => {
    return () => {
      ttsQueueRef.current?.stop();
      browserTtsClientRef.current.stop();
    };
  }, []);

  useEffect(() => {
    function flushReadingProgress() {
      if (!bookId) {
        return;
      }

      const runtimeHandle = runtimeHandleValueRef.current;
      const currentLocation = currentLocationRef.current;
      const viewportSnapshot = runtimeHandle?.getViewportLocationSnapshot?.();
      const immediateLocation = currentLocation.cfi
        ? {
            ...currentLocation,
            ...viewportSnapshot,
            sectionPath: resolveSectionPathForLocation(
              {
                ...currentLocation,
                ...viewportSnapshot,
              },
              currentLocation,
            ),
          }
        : null;

      if (immediateLocation?.cfi) {
        writeRefreshProgressSnapshot(bookId, immediateLocation);
      }

      void (async () => {
        const runtimeLocation = await runtimeHandle?.getCurrentLocation?.();
        const nextLocation = runtimeLocation
          ? {
              ...runtimeLocation,
              sectionPath: resolveSectionPathForLocation(runtimeLocation, immediateLocation ?? currentLocation),
            }
          : immediateLocation;
        if (!nextLocation?.cfi) {
          return;
        }

        writeRefreshProgressSnapshot(bookId, nextLocation);
        await saveProgress(bookId, {
          cfi: nextLocation.cfi,
          pageIndex: nextLocation.pageIndex,
          pageOffset: nextLocation.pageOffset,
          progress: nextLocation.progress,
          scrollTop: nextLocation.scrollTop,
          spineItemId: nextLocation.spineItemId,
          textQuote: nextLocation.textQuote,
        });
      })();
    }

    window.addEventListener("pagehide", flushReadingProgress);
    window.addEventListener("beforeunload", flushReadingProgress);
    return () => {
      window.removeEventListener("pagehide", flushReadingProgress);
      window.removeEventListener("beforeunload", flushReadingProgress);
    };
  }, [bookId]);

  useEffect(() => {
    function flushReaderSettings() {
      writeRefreshSettingsSnapshot(settingsRef.current);
    }

    window.addEventListener("pagehide", flushReaderSettings);
    window.addEventListener("beforeunload", flushReaderSettings);
    return () => {
      window.removeEventListener("pagehide", flushReaderSettings);
      window.removeEventListener("beforeunload", flushReaderSettings);
    };
  }, []);

  useEffect(() => {
    if (ttsState.mode !== "continuous" || ttsState.status === "idle") {
      return;
    }

    lastContinuousMarkerCfiRef.current = ttsState.markerCfi;
    lastContinuousTextRef.current = ttsState.markerText || ttsState.currentText;
  }, [ttsState.currentText, ttsState.markerCfi, ttsState.markerText, ttsState.mode, ttsState.status]);

  useEffect(() => {
    if (
      ttsState.mode !== "idle" ||
      ttsState.status !== "idle" ||
      !continuousSessionActiveRef.current ||
      continuousAdvanceInFlightRef.current ||
      !runtimeHandle
    ) {
      return;
    }

    const previousSpokenText = lastContinuousTextRef.current;
    const previousMarkerCfi = lastContinuousMarkerCfiRef.current;
    const previousSpineItemId = continuousSpineItemIdRef.current;
    if (!previousSpineItemId || !continuousChunksRef.current.length) {
      continuousSessionActiveRef.current = false;
      return;
    }

    continuousAdvanceInFlightRef.current = true;
    continuousChunksRef.current = [];

    void (async () => {
      try {
        if (previousMarkerCfi) {
          await runtimeHandle.goTo(previousMarkerCfi);
        }

        await runtimeHandle.next();

        const nextLocation = await runtimeHandle.getCurrentLocation?.();
        const nextChunks = await getContinuousTtsChunks(
          runtimeHandle,
          settingsRef.current.readingMode,
          settingsRef.current.ttsFollowPlayback,
        );
        const nextSpineItemId =
          getChunkSpineItemId(nextChunks) || nextLocation?.spineItemId || currentLocationRef.current.spineItemId;
        const nextFirstMarkerCfi = nextChunks[0]?.markers[0]?.cfi ?? "";
        const nextFirstText = nextChunks[0]?.markers[0]?.text ?? nextChunks[0]?.text ?? "";
        const advanced =
          Boolean(nextChunks.length) &&
          (Boolean(nextSpineItemId && nextSpineItemId !== previousSpineItemId) ||
            Boolean(nextFirstMarkerCfi && nextFirstMarkerCfi !== previousMarkerCfi) ||
            Boolean(nextFirstText && nextFirstText !== previousSpokenText));

        if (!advanced || !nextChunks.length) {
          continuousSessionActiveRef.current = false;
          continuousSpineItemIdRef.current = "";
          return;
        }

        startContinuousQueue(nextChunks, nextSpineItemId || previousSpineItemId);
      } catch (error) {
        continuousSessionActiveRef.current = false;
        continuousSpineItemIdRef.current = "";
        setTtsState({
          chunkIndex: -1,
          currentText: "",
          error: `TTS failed: ${formatTtsError(error)}`,
          markerCfi: "",
          markerIndex: -1,
          markerText: "",
          mode: "idle",
          status: "error",
        });
      } finally {
        continuousAdvanceInFlightRef.current = false;
      }
    })();
  }, [runtimeHandle, ttsState.currentText, ttsState.markerCfi, ttsState.mode, ttsState.status]);

  const selectedText = selectedSelection?.text ?? "";
  const selectedCfiRange = selectedSelection?.cfiRange ?? "";
  const selectedSpineItemId = selectedSelection?.spineItemId ?? currentSpineItemId;

  async function refreshAnnotations() {
    if (!bookId || !selectedSpineItemId) {
      return;
    }

    setVisibleAnnotations(await annotationService.queryVisible(bookId, selectedSpineItemId));
  }

  async function refreshBookmarks() {
    if (!bookId) {
      return;
    }

    const nextBookmarks = await annotationService
      .listByBook(bookId)
      .then((records) => records.filter((record): record is BookmarkRecord => record.kind === "bookmark"));
    setBookmarks(nextBookmarks);
  }

  function startContinuousQueue(chunks: ChunkSegment[], spineItemId: string) {
    continuousSpineSyncPendingRef.current =
      spineItemId && currentLocationRef.current.spineItemId !== spineItemId ? spineItemId : "";
    continuousSessionActiveRef.current = true;
    continuousSpineItemIdRef.current = spineItemId;
    continuousChunksRef.current = chunks;
    lastAutoPagedCfiRef.current = "";
    browserTtsClientRef.current.stop();
    setTtsState({
      chunkIndex: 0,
      currentText: chunks[0]?.text ?? "",
      error: "",
      markerCfi: chunks[0]?.markers[0]?.cfi ?? "",
      markerIndex: 0,
      markerText: chunks[0]?.markers[0]?.text ?? chunks[0]?.text ?? "",
      mode: "continuous",
      status: "loading",
    });

    void ensureTtsQueue().start({
      chunks,
      request: {
        rate: settings.ttsRate,
        voiceId: settings.ttsVoice,
        volume: settings.ttsVolume,
        initialMarkerFallbackMs:
          settings.readingMode === "paginated" ? paginatedInitialMarkerFallbackMs : undefined,
      },
    });
  }

  async function requestTranslation(text: string, sentenceContext?: string, selectionForBubble?: ReaderSelection | null) {
    const nextText = text.trim();
    if (!nextText) {
      return;
    }

    const requestVersion = ++translationRequestVersionRef.current;
    const requestSelectionKey = getSelectionCacheKey(selectionForBubble ?? null);
    const ipaWord = getEligibleIpaWord(nextText);
    const singleWordSelection = isSingleWordSelection(nextText);
    setTranslationError("");
    setAiIpa("");
    setTranslation("");
    setEnglishDefinition("");
    setFloatingSelectionTranslation(null);

    try {
      const [result, ipa, nextEnglishDefinition] = await Promise.all([
        ai.translateSelection(nextText, {
          sentenceContext,
          targetLanguage: settings.targetLanguage || navigator.language || "zh-CN",
        }),
        ipaWord ? phoneticsServiceRef.current.lookupIpa(ipaWord) : Promise.resolve(null),
        singleWordSelection && typeof ai.defineSelection === "function"
          ? ai
              .defineSelection(nextText, {
                sentenceContext,
                targetLanguage: settings.targetLanguage || navigator.language || "zh-CN",
              })
              .then((value) => value.trim())
              .catch(() => "")
          : Promise.resolve(""),
      ]);
      if (translationRequestVersionRef.current !== requestVersion) {
        return;
      }
      if (selectionForBubble?.isReleased === false && requestSelectionKey) {
        const currentSelectionKey = getSelectionCacheKey(selectionBridge.read());
        if (currentSelectionKey !== requestSelectionKey) {
          return;
        }
      }
      if (singleWordSelection) {
        setTranslation(result);
        setAiIpa(ipa ?? "");
        setEnglishDefinition(nextEnglishDefinition);
        if (!isTabletLayout) {
          return;
        }
      }

      const bubbleSelection = resolveSelectionForFloatingBubble(selectionForBubble, nextText);
      if (bubbleSelection?.selectionRect) {
        setFloatingSelectionTranslation({
          anchorRect: bubbleSelection.selectionRect,
          translation: result,
        });
      }
    } catch (error) {
      if (translationRequestVersionRef.current !== requestVersion) {
        return;
      }
      if (singleWordSelection) {
        setTranslationError(`Translate failed: ${String(error)}`);
      }
      setEnglishDefinition("");
      setFloatingSelectionTranslation(null);
    }
  }

  async function requestExplanation(text: string) {
    const nextText = text.trim();
    if (!nextText) {
      return;
    }

    const requestVersion = ++explanationRequestVersionRef.current;
    setGrammarExplainPopup({
      error: "",
      explanation: "",
      isLoading: true,
      selectedText: nextText,
    });

    try {
      const result = await ai.explainSelection(nextText, {
        targetLanguage: settings.targetLanguage || navigator.language || "zh-CN",
      });
      if (explanationRequestVersionRef.current !== requestVersion) {
        return;
      }
      setGrammarExplainPopup({
        error: "",
        explanation: result,
        isLoading: false,
        selectedText: nextText,
      });
    } catch (error) {
      if (explanationRequestVersionRef.current !== requestVersion) {
        return;
      }
      setGrammarExplainPopup({
        error: `语法解析失败：${String(error)}`,
        explanation: "",
        isLoading: false,
        selectedText: nextText,
      });
    }
  }

  async function startSelectionSpeech(
    text: string,
    options?: {
      onPlaybackError?: () => void;
      onPlaybackStart?: () => void;
    },
  ) {
    const nextText = text.trim();
    if (!nextText) {
      return;
    }

    activeSelectionSpeechRequestRef.current += 1;
    const requestId = activeSelectionSpeechRequestRef.current;
    continuousSessionActiveRef.current = false;
    continuousAdvanceInFlightRef.current = false;
    continuousSpineItemIdRef.current = "";
    continuousChunksRef.current = [];
    ttsQueueRef.current?.stop();
    browserTtsClientRef.current.stop();
    setTtsState({
      chunkIndex: -1,
      currentText: nextText,
      error: "",
      markerCfi: "",
      markerIndex: -1,
      markerText: "",
      mode: "selection",
      status: "loading",
    });

    try {
      await browserTtsClientRef.current.speakSelection(nextText, {
        onStart: () => {
          if (activeSelectionSpeechRequestRef.current !== requestId) {
            return;
          }

          options?.onPlaybackStart?.();
          setTtsState({
            chunkIndex: -1,
            currentText: nextText,
            error: "",
            markerCfi: "",
            markerIndex: -1,
            markerText: "",
            mode: "selection",
            status: "playing",
          });
        },
        onEnd: () => {
          if (activeSelectionSpeechRequestRef.current !== requestId) {
            return;
          }

          setTtsState({
            chunkIndex: -1,
            currentText: "",
            error: "",
            markerCfi: "",
            markerIndex: -1,
            markerText: "",
            mode: "idle",
            status: "idle",
          });
        },
        onError: (error) => {
          if (activeSelectionSpeechRequestRef.current !== requestId) {
            return;
          }

          options?.onPlaybackError?.();
          setTtsState({
            chunkIndex: -1,
            currentText: nextText,
            error: `TTS failed: ${formatTtsError(error)}`,
            markerCfi: "",
            markerIndex: -1,
            markerText: "",
            mode: "selection",
            status: "error",
          });
        },
        rate: settings.ttsRate,
        voiceId: settings.ttsVoice,
        volume: settings.ttsVolume,
      });
    } catch (error) {
      if (activeSelectionSpeechRequestRef.current !== requestId) {
        return;
      }

      options?.onPlaybackError?.();
      setTtsState({
        chunkIndex: -1,
        currentText: nextText,
        error: `TTS failed: ${formatTtsError(error)}`,
        markerCfi: "",
        markerIndex: -1,
        markerText: "",
        mode: "selection",
        status: "error",
      });
    }
  }

  async function handleTranslate() {
    await requestTranslation(selectedText, selectedSelection?.sentenceContext, selectedSelection);
  }

  async function handleExplain() {
    await requestExplanation(selectedText);
  }

  async function handleReadAloud() {
    if (!selectedText) {
      return;
    }

    await startSelectionSpeech(selectedText);
  }

  async function handleHighlight() {
    if (!bookId || !selectedText || !selectedCfiRange || !selectedSpineItemId) {
      return;
    }

    await annotationService.createHighlight({
      bookId,
      spineItemId: selectedSpineItemId,
      startCfi: selectedCfiRange,
      endCfi: selectedCfiRange,
      textQuote: selectedText,
      color: "amber",
    });
    await refreshAnnotations();
  }

  function handleAddNote() {
    if (!selectedText) {
      return;
    }

    setNoteOpen(true);
    setNoteDraft("");
  }

  async function handleSaveNote() {
    if (!bookId || !noteDraft || !selectedText || !selectedCfiRange || !selectedSpineItemId) {
      return;
    }

    await annotationService.createNote({
      body: noteDraft,
      bookId,
      color: "amber",
      endCfi: selectedCfiRange,
      spineItemId: selectedSpineItemId,
      startCfi: selectedCfiRange,
      textQuote: selectedText,
    });
    setNoteOpen(false);
    setNoteDraft("");
    await refreshAnnotations();
  }

  async function handleToggleBookmark() {
    if (!bookId || !currentLocation.cfi || !currentLocation.spineItemId) {
      return;
    }

    const existingBookmark = bookmarks.find((bookmark) => bookmark.cfi === currentLocation.cfi);

    if (existingBookmark) {
      await annotationService.removeBookmark(existingBookmark.id);
    } else {
      await annotationService.createBookmark(bookId, currentLocation.spineItemId, currentLocation.cfi);
    }

    await refreshBookmarks();
  }

  async function handleRemoveHighlight(id: string) {
    await annotationService.removeAnnotation(id);
    await refreshAnnotations();
  }

  async function updateSettings(patch: Partial<SettingsInput>) {
    const nextSettings = { ...settingsRef.current, ...patch };
    settingsDirtyRef.current = true;
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    writeRefreshSettingsSnapshot(nextSettings);
    await saveSettings(patch);
  }

  async function handleChangeReadingMode(mode: ReadingMode) {
    setTtsStartReady(false);
    const modeSwitchLocation =
      (locationTargetIntent === "explicit" ? explicitLocationTarget : undefined) ??
      (await runtimeHandle?.getCurrentLocation?.())?.cfi ??
      currentLocationRef.current.cfi ??
      currentLocationRef.current.spineItemId;
    setLocationTarget(modeSwitchLocation || undefined);
    setLocationTargetIntent("explicit");
    setExplicitLocationTarget(modeSwitchLocation || undefined);
    setPreferExactViewportTarget(true);
    await updateSettings({ readingMode: mode });
  }

  async function handleAppearanceChange(patch: Partial<ReaderPreferences>) {
    await updateSettings(patch);
  }

  async function handleLlmApiUrlChange(llmApiUrl: string) {
    await updateSettings({ llmApiUrl });
  }

  async function handleGrammarLlmApiUrlChange(grammarLlmApiUrl: string) {
    await updateSettings({ grammarLlmApiUrl });
  }

  async function handleTranslationProviderChange(translationProvider: TranslationProvider) {
    await updateSettings({ translationProvider });
  }

  async function handleLocalLlmModelChange(localLlmModel: string) {
    await updateSettings({ localLlmModel });
  }

  async function handleGrammarLlmModelChange(grammarLlmModel: string) {
    await updateSettings({ grammarLlmModel });
  }

  async function handleApiKeyChange(apiKey: string) {
    await updateSettings({ apiKey });
  }

  async function handleGeminiModelChange(geminiModel: string) {
    await updateSettings({ geminiModel });
  }

  async function handleQuickTtsRateChange(rate: number) {
    await updateSettings({ ttsRate: rate });

    if (ttsState.mode === "selection" && ttsState.status !== "idle" && ttsState.currentText) {
      await startSelectionSpeech(ttsState.currentText);
      return;
    }

    if (ttsState.mode !== "continuous" || ttsState.status === "idle" || !continuousChunksRef.current.length) {
      return;
    }

    const queue = ensureTtsQueue();
    const remainingChunks = sliceChunksFromMarker(
      continuousChunksRef.current,
      Math.max(0, ttsState.chunkIndex),
      Math.max(0, ttsState.markerIndex),
    );

    if (!remainingChunks.length) {
      return;
    }

    lastAutoPagedCfiRef.current = "";
    continuousChunksRef.current = remainingChunks;
    browserTtsClientRef.current.stop();
    await queue.start({
      chunks: remainingChunks,
      request: {
        rate,
        voiceId: settings.ttsVoice,
        volume: settings.ttsVolume,
      },
    });
  }

  async function handleTtsVoiceChange(voiceId: string) {
    await updateSettings({ ttsVoice: voiceId });
  }

  async function handleTtsVolumeChange(volume: number) {
    await updateSettings({ ttsVolume: volume });
  }

  async function handleTtsFollowPlaybackChange(ttsFollowPlayback: boolean) {
    void runtimeHandleValueRef.current?.setTtsPlaybackFollow?.(ttsFollowPlayback);
    await updateSettings({ ttsFollowPlayback });
  }

  function getRecentReleasedSelectionFallback() {
    if (Date.now() - lastReleasedSelectionAtRef.current > recentReleasedSelectionWindowMs) {
      return null;
    }

    return lastReleasedSelectionRef.current?.text.trim() ? lastReleasedSelectionRef.current : null;
  }

  function handlePrepareStartTts() {
    const runtimeSelection = runtimeHandleValueRef.current?.getCurrentSelectionSnapshot?.() ?? null;
    const bridgeSelection = selectionBridge.read();
    const immediateSelection = runtimeSelection ?? bridgeSelection ?? selectedSelection;
    const recentReleasedSelection = getRecentReleasedSelectionFallback();
    const latestSelection = immediateSelection ?? recentReleasedSelection;
    const latestSelectionKey = getSelectionCacheKey(latestSelection);
    pendingPointerStartSelectionRef.current = latestSelection?.text.trim() ? latestSelection : null;
    pendingPointerStartBlocksPromiseRef.current =
      immediateSelection?.text.trim() || !latestSelection?.text.trim()
        ? (runtimeHandleValueRef.current?.getTtsBlocksFromCurrentSelection?.() ?? null)
        : latestSelectionKey && cachedSelectionBlocksKeyRef.current === latestSelectionKey
          ? cachedSelectionBlocksPromiseRef.current
          : null;
  }

  async function handleStartTts() {
    if (!runtimeHandle || !ttsStartReady) {
      return;
    }

    const liveRuntimeSelection = await runtimeHandle.getCurrentSelection?.();
    const pendingPointerStartBlocks =
      (await pendingPointerStartBlocksPromiseRef.current?.catch(() => [])) ?? [];
    const latestSelection =
      liveRuntimeSelection ??
      selectionBridge.read() ??
      selectedSelection ??
      pendingPointerStartSelectionRef.current ??
      getRecentReleasedSelectionFallback();
    const selectionSnapshotChunks = latestSelection?.ttsBlocks?.length && !(latestSelection?.cfiRange?.trim())
      ? getContinuousTtsChunksFromBlocks(latestSelection.ttsBlocks, settings.readingMode, settings.ttsFollowPlayback)
      : [];
    const latestSelectionKey = getSelectionCacheKey(latestSelection);
    const cachedSelectionBlocks =
      latestSelectionKey && cachedSelectionBlocksKeyRef.current === latestSelectionKey
        ? (await cachedSelectionBlocksPromiseRef.current?.catch(() => [])) ?? []
        : [];
    pendingPointerStartSelectionRef.current = null;
    pendingPointerStartBlocksPromiseRef.current = null;
    const pointerSelectionDrivenChunks = pendingPointerStartBlocks.length
      ? getContinuousTtsChunksFromBlocks(
          pendingPointerStartBlocks,
          settings.readingMode,
          settings.ttsFollowPlayback,
        )
      : [];
    const cachedSelectionDrivenChunks = cachedSelectionBlocks.length
      ? getContinuousTtsChunksFromBlocks(cachedSelectionBlocks, settings.readingMode, settings.ttsFollowPlayback)
      : [];
    const selectionDrivenChunks = pointerSelectionDrivenChunks.length
      ? pointerSelectionDrivenChunks
      : selectionSnapshotChunks.length
        ? selectionSnapshotChunks
      : cachedSelectionDrivenChunks.length
        ? cachedSelectionDrivenChunks
      : await getContinuousTtsChunksFromSelection(
          runtimeHandle,
          settings.readingMode,
          latestSelection,
          settings.ttsFollowPlayback,
        );
    const pendingStartTarget = pendingTtsStartTargetRef.current.trim();
    let targetDrivenChunks: ChunkSegment[] = [];
    if (!selectionDrivenChunks.length && pendingStartTarget) {
      try {
        await runtimeHandle.goTo(pendingStartTarget);
      } catch {
        // Fall back to the currently rendered location if the explicit target cannot be re-opened.
      }
      targetDrivenChunks = await getContinuousTtsChunksFromTarget(
        runtimeHandle,
        settings.readingMode,
        pendingStartTarget,
        settings.ttsFollowPlayback,
      );
    }
    const chunks = selectionDrivenChunks.length
      ? selectionDrivenChunks
      : targetDrivenChunks.length
        ? targetDrivenChunks
        : await getContinuousTtsChunks(runtimeHandle, settings.readingMode, settings.ttsFollowPlayback);

    if (!chunks.length) {
      setTtsState({
        chunkIndex: -1,
        currentText: "",
        error: "No readable text is available from the current location.",
        markerCfi: "",
        markerIndex: -1,
        markerText: "",
        mode: "idle",
        status: "error",
      });
      return;
    }

    if (bookId) {
      clearRefreshTtsStartTargetSnapshot(bookId);
    }
    pendingTtsStartTargetRef.current = "";

    if (selectionDrivenChunks.length && (latestSelection?.text.trim() || pointerSelectionDrivenChunks.length)) {
      await runtimeHandle.clearSelection?.();
      selectionBridge.publish(null);
      setSelectedSelection(null);
      cachedSelectionBlocksKeyRef.current = "";
      cachedSelectionBlocksPromiseRef.current = null;
      lastReleasedSelectionRef.current = null;
      lastReleasedSelectionAtRef.current = 0;
    }

    const runtimeLocation = await runtimeHandle.getCurrentLocation?.();
    activeSelectionSpeechRequestRef.current += 1;
    startContinuousQueue(
      chunks,
      resolveContinuousTtsSpineItemId(
        chunks,
        currentSpineItemId || runtimeLocation?.spineItemId || currentLocationRef.current.spineItemId,
      ),
    );
  }

  function handlePauseTts() {
    if (ttsState.mode === "continuous") {
      ttsQueueRef.current?.pause();
      return;
    }

    browserTtsClientRef.current.pause();
    setTtsState((currentState) => ({
      ...currentState,
      status: "paused",
    }));
  }

  async function handleResumeTts() {
    if (ttsState.mode === "continuous") {
      await ttsQueueRef.current?.resume();
      return;
    }

    browserTtsClientRef.current.resume();
    setTtsState((currentState) => ({
      ...currentState,
      status: "playing",
    }));
  }

  function handleStopTts() {
    activeSelectionSpeechRequestRef.current += 1;
    continuousSessionActiveRef.current = false;
    continuousAdvanceInFlightRef.current = false;
    continuousSpineItemIdRef.current = "";
    continuousChunksRef.current = [];
    lastAutoPagedCfiRef.current = "";
    if (ttsState.mode === "continuous") {
      ttsQueueRef.current?.stop();
    } else {
      browserTtsClientRef.current.stop();
      setTtsState({
        chunkIndex: -1,
        currentText: "",
        error: "",
        markerCfi: "",
        markerIndex: -1,
        markerLocatorText: "",
        markerText: "",
        mode: "idle",
        status: "idle",
      });
    }
  }

  const highlights = visibleAnnotations
    .filter((annotation) => annotation.kind === "highlight")
    .map((annotation) => ({
      id: annotation.id,
      text: annotation.textQuote,
    }));
  const notes = visibleAnnotations
    .filter((annotation) => annotation.kind === "note")
    .map((annotation) => ({
      id: annotation.id,
      text: annotation.body,
    }));
  const bookmarkItems = bookmarks.map((bookmark, index) => ({
    cfi: bookmark.cfi,
    id: bookmark.id,
    label: findTocLabelBySpineItemId(toc, bookmark.spineItemId) ?? `Saved location ${index + 1}`,
  }));
  const isCurrentLocationBookmarked = bookmarks.some((bookmark) => bookmark.cfi === currentLocation.cfi);
  const readerPreferences = useMemo(
    () => getEffectiveReaderPreferences(toReaderPreferences(settings)),
    [settings],
  );
  const readerPreferencesSignature = useMemo(() => JSON.stringify(readerPreferences), [readerPreferences]);
  const readerStyle = useMemo<
    CSSProperties &
      Record<"--reader-font-scale" | "--reader-page-background" | "--reader-paginated-prose-width", string>
  >(
    () => ({
      "--reader-font-scale": String(settings.fontScale),
      "--reader-page-background": settings.contentBackgroundColor,
      "--reader-paginated-prose-width": `${readerPreferences.maxLineWidth + readerPreferences.contentPadding * 2}px`,
    }),
    [readerPreferences.contentPadding, readerPreferences.maxLineWidth, settings.contentBackgroundColor, settings.fontScale],
  );
  const currentSectionPath = useMemo(() => {
    const labels = (currentLocation.sectionPath?.length
      ? currentLocation.sectionPath
      : findTocPathBySpineItemId(toc, currentSpineItemId)
          .map((item) => item.label.trim())
          .filter(Boolean))
      .map((label) => label.trim())
      .filter(Boolean);

    return labels.filter((label, index) => index === 0 || label !== labels[index - 1]);
  }, [currentLocation.sectionPath, currentSpineItemId, toc]);
  const shouldRenderViewport = Boolean(bookId) && isProgressReady && isSettingsReady;
  const nextInitialCfi = locationTarget ?? initialCfi;
  const leftRail = (
    <LeftRail
      bookmarks={bookmarkItems}
      currentSectionPath={currentLocation.sectionPath}
      currentSpineItemId={currentSpineItemId}
      highlights={highlights}
      notes={notes}
      onNavigateToBookmark={handleNavigateToBookmark}
      onRemoveHighlight={handleRemoveHighlight}
      onNavigateToTocItem={handleNavigateToLocation}
      toc={toc}
    />
  );
  const rightPanel = (
    <RightPanel
      apiKey={settings.apiKey}
      aiIpa={aiIpa}
      annotationCount={visibleAnnotations.length}
      appearance={readerPreferences}
      aria-label="Reader tools"
      geminiModel={settings.geminiModel}
      grammarLlmApiUrl={settings.grammarLlmApiUrl}
      grammarLlmModel={settings.grammarLlmModel}
      llmApiUrl={settings.llmApiUrl}
      localLlmModel={settings.localLlmModel}
      noteDraft={noteDraft}
      noteOpen={noteOpen}
      onApiKeyChange={handleApiKeyChange}
      onAppearanceChange={handleAppearanceChange}
      onGeminiModelChange={handleGeminiModelChange}
      onGrammarLlmApiUrlChange={handleGrammarLlmApiUrlChange}
      onGrammarLlmModelChange={handleGrammarLlmModelChange}
      onLlmApiUrlChange={handleLlmApiUrlChange}
      onLocalLlmModelChange={handleLocalLlmModelChange}
      onNoteDraftChange={setNoteDraft}
      onNoteSave={handleSaveNote}
      onSelectionReadAloud={handleReadAloud}
      onTtsPause={handlePauseTts}
      onTtsFollowPlaybackChange={handleTtsFollowPlaybackChange}
      onTtsRateChange={handleQuickTtsRateChange}
      onTtsResume={handleResumeTts}
      onTtsStartPointerDown={handlePrepareStartTts}
      onTtsStart={handleStartTts}
      onTtsStop={handleStopTts}
      onTtsVoiceChange={handleTtsVoiceChange}
      onTtsVolumeChange={handleTtsVolumeChange}
      onTranslationProviderChange={handleTranslationProviderChange}
      readerStatus={readerStatus}
      selectedText={selectedText}
      translation={translation}
      englishDefinition={englishDefinition}
      translationError={translationError}
      translationProvider={settings.translationProvider}
      ttsCurrentText={ttsState.currentText}
      ttsError={ttsState.error}
      ttsFollowPlayback={settings.ttsFollowPlayback}
      ttsRate={settings.ttsRate}
      ttsStartDisabled={!ttsStartReady}
      ttsStatus={ttsState.status}
      ttsVoice={settings.ttsVoice}
      ttsVoices={ttsVoices}
      ttsVolume={settings.ttsVolume}
    />
  );

  function navigateToLocation(target: string) {
    const targetSectionPath = findTocPathByTarget(toc, target)
      .map((item) => item.label.trim())
      .filter(Boolean);

    if (targetSectionPath.length) {
      lastResolvedSectionPathRef.current = {
        path: targetSectionPath,
        spineItemId: target.split("#")[0] ?? "",
      };
      currentLocationRef.current = {
        ...currentLocationRef.current,
        sectionPath: targetSectionPath,
      };
      setCurrentLocation((current) => ({
        ...current,
        sectionPath: targetSectionPath,
      }));
    }

    pendingTtsStartTargetRef.current = target;
    setLocationTargetIntent("explicit");
    setExplicitLocationTarget(target);
    if (bookId) {
      writeRefreshTtsStartTargetSnapshot(bookId, target);
      writeRefreshProgressSnapshot(bookId, {
        cfi: target,
        progress: currentLocationRef.current.progress,
        ...(targetSectionPath.length ? { sectionPath: targetSectionPath } : {}),
        ...(typeof currentLocationRef.current.pageIndex === "number"
          ? { pageIndex: currentLocationRef.current.pageIndex }
          : {}),
        ...(typeof currentLocationRef.current.pageOffset === "number"
          ? { pageOffset: currentLocationRef.current.pageOffset }
          : {}),
        ...(typeof currentLocationRef.current.scrollTop === "number"
          ? { scrollTop: currentLocationRef.current.scrollTop }
          : {}),
        ...(currentLocationRef.current.spineItemId ? { spineItemId: currentLocationRef.current.spineItemId } : {}),
        ...(currentLocationRef.current.textQuote ? { textQuote: currentLocationRef.current.textQuote } : {}),
      });
    }

    if (!runtimeHandle) {
      setLocationTarget(target);
      setPreferExactViewportTarget(true);
      return;
    }

    void runtimeHandle.goTo(target).catch(() => {
      setLocationTargetIntent("explicit");
      setExplicitLocationTarget(target);
      setLocationTarget(target);
      setPreferExactViewportTarget(true);
    });
  }

  function handleNavigateToLocation(target: string) {
    navigateToLocation(target);
    if (isTabletLayout) {
      setIsContentsDrawerOpen(false);
    }
  }

  function handleNavigateToBookmark(target: string) {
    navigateToLocation(target);
    if (isTabletLayout) {
      setIsContentsDrawerOpen(false);
    }
  }

  useEffect(() => {
    if (!runtimeHandle || typeof runtimeHandle.applyPreferences !== "function") {
      appliedPreferencesRuntimeRef.current = null;
      appliedPreferencesSignatureRef.current = "";
      return;
    }

    if (appliedPreferencesRuntimeRef.current !== runtimeHandle) {
      appliedPreferencesRuntimeRef.current = runtimeHandle;
      appliedPreferencesSignatureRef.current = readerPreferencesSignature;
      return;
    }

    if (appliedPreferencesSignatureRef.current === readerPreferencesSignature) {
      return;
    }

    appliedPreferencesSignatureRef.current = readerPreferencesSignature;
    void runtimeHandle.applyPreferences(readerPreferences);
  }, [readerPreferences, readerPreferencesSignature, runtimeHandle]);

  return (
    <main className={`reader-layout theme-${settings.theme}${isTabletLayout ? " reader-layout-tablet" : ""}`} style={readerStyle}>
      {!isTabletLayout ? leftRail : null}
      <section className="reader-center" aria-label="Reading workspace">
        <TopBar
          canToggleBookmark={Boolean(bookId && currentLocation.cfi && currentLocation.spineItemId)}
          canTurnPages={Boolean(runtimeHandle)}
          isBookmarked={isCurrentLocationBookmarked}
          onChangeReadingMode={handleChangeReadingMode}
          onNextPage={() => void runtimeHandle?.next()}
          onPrevPage={() => void runtimeHandle?.prev()}
          onToggleBookmark={handleToggleBookmark}
          progress={currentLocation.progress}
          readAloudAction={
            <button className="selection-action" disabled={selectedText.length === 0} onClick={handleReadAloud} type="button">
              Read aloud
            </button>
          }
          readingMode={settings.readingMode}
          sectionPath={currentSectionPath}
          systemActions={
            <>
              {isTabletLayout ? (
                <div aria-label="Reader panel actions" className="reader-system-actions-group" role="group">
                  <button
                    aria-expanded={isContentsDrawerOpen}
                    className="reader-shell-action-button"
                    onClick={() => {
                      setIsContentsDrawerOpen((current) => !current);
                      setIsToolsDrawerOpen(false);
                    }}
                    type="button"
                  >
                    Contents
                  </button>
                  <button
                    aria-expanded={isToolsDrawerOpen}
                    className="reader-shell-action-button"
                    onClick={() => {
                      setIsToolsDrawerOpen((current) => !current);
                      setIsContentsDrawerOpen(false);
                    }}
                    type="button"
                  >
                    Tools
                  </button>
                </div>
              ) : null}
              {shellContext ? (
                <div aria-label="Reader system actions" className="reader-system-actions-group" role="group">
                  <button
                    aria-expanded={shellContext.isLibraryOpen}
                    className="reader-shell-action-button"
                    onClick={shellContext.onLibraryClick}
                    type="button"
                  >
                    Library
                  </button>
                  <button
                    className="reader-shell-action-button"
                    disabled={shellContext.isImporting}
                    onClick={shellContext.onImportClick}
                    type="button"
                  >
                    {shellContext.isImporting ? "Importing EPUB..." : "Import EPUB"}
                  </button>
                  <button
                    aria-expanded={shellContext.isSettingsOpen}
                    className="reader-shell-action-button"
                    onClick={shellContext.onSettingsClick}
                    type="button"
                  >
                    Settings
                  </button>
                </div>
              ) : null}
            </>
          }
          selectionActions={
            <SelectionPopover
              hasSelection={selectedText.length > 0}
              onAddNote={handleAddNote}
              onExplain={handleExplain}
              onHighlight={handleHighlight}
              onReadAloud={handleReadAloud}
              showReadAloud={false}
              onTranslate={handleTranslate}
            />
          }
        />
        <div className="reader-workspace">
          <section className="reader-stage" aria-label="Reader stage" ref={readerStageRef}>
            {shouldRenderViewport ? (
              <EpubViewport
                activeTtsSegment={activeContinuousTtsSegment}
                bookId={bookId}
                initialCfi={nextInitialCfi}
                initialProgress={initialProgress}
                preferExactInitialTarget={preferExactViewportTarget}
                onLocationChange={({ cfi, pageIndex, pageOffset, progress, sectionPath, scrollTop, spineItemId, textQuote }) => {
                  const nextSectionPath = resolveSectionPathForLocation(
                    { cfi, sectionPath, spineItemId },
                    currentLocationRef.current,
                  );
                  if (bookId) {
                    writeRefreshProgressSnapshot(bookId, {
                      cfi,
                      pageIndex,
                      pageOffset,
                      progress,
                      ...(nextSectionPath?.length ? { sectionPath: nextSectionPath } : {}),
                      scrollTop,
                      spineItemId,
                      textQuote,
                    });
                  }
                  setCurrentLocation({
                    cfi,
                    pageIndex,
                    pageOffset,
                    progress,
                    sectionPath: nextSectionPath,
                    scrollTop,
                    spineItemId,
                    textQuote,
                  });
                  setCurrentSpineItemId(spineItemId);
                }}
                onReady={setRuntimeHandle}
                onStatusChange={setReaderStatus}
                onTocChange={setToc}
                readerPreferences={readerPreferences}
                readingMode={settings.readingMode}
                runtime={runtime}
                ttsFollowPlayback={settings.ttsFollowPlayback}
                visibleAnnotations={visibleAnnotations}
              />
            ) : (
              <section className="epub-viewport" aria-label="Book content">
                <article className="reader-page-card">
                  <p className="reader-eyebrow">Reading session</p>
                  <h1 className="reader-title">Preparing your book...</h1>
                  <p className="reader-copy">
                    Loading your saved location before opening the book so the page lands where you left off.
                  </p>
                </article>
              </section>
            )}
            {ttsSentenceTranslationNote ? (
              <TtsSentenceTranslationNote
                fontScale={settings.ttsSentenceTranslationFontScale}
                left={ttsSentenceTranslationNote.left}
                top={ttsSentenceTranslationNote.top}
                translation={ttsSentenceTranslationNote.translation}
                width={ttsSentenceTranslationNote.width}
              />
            ) : null}
          </section>
          {!isTabletLayout ? rightPanel : null}
        </div>
        {isTabletLayout ? (
          <ReaderDrawer
            eyebrow="Contents"
            label="Contents drawer"
            onClose={() => setIsContentsDrawerOpen(false)}
            open={isContentsDrawerOpen}
            side="left"
            title="Table of contents"
          >
            {leftRail}
          </ReaderDrawer>
        ) : null}
        {isTabletLayout ? (
          <ReaderDrawer
            eyebrow="Tools"
            label="Reader tools drawer"
            onClose={() => setIsToolsDrawerOpen(false)}
            open={isToolsDrawerOpen}
            side="right"
            title="Reader tools"
          >
            {rightPanel}
          </ReaderDrawer>
        ) : null}
        {floatingSelectionTranslation ? (
          <SelectionTranslationBubble
            anchorRect={floatingSelectionTranslation.anchorRect}
            onDismiss={() => setFloatingSelectionTranslation(null)}
            translation={floatingSelectionTranslation.translation}
          />
        ) : null}
        {grammarExplainPopup ? (
          <GrammarExplainPopup
            error={grammarExplainPopup.error}
            explanation={grammarExplainPopup.explanation}
            fontScale={settings.ttsSentenceTranslationFontScale}
            isLoading={grammarExplainPopup.isLoading}
            onClose={() => setGrammarExplainPopup(null)}
            selectedText={grammarExplainPopup.selectedText}
          />
        ) : null}
      </section>
    </main>
  );
}
