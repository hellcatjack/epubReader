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
import type { ActiveTtsSegment, EpubViewportRuntime, RuntimeRenderHandle, RuntimeTtsBlock } from "./epubRuntime";
import {
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
import { RightPanel } from "./RightPanel";
import { SelectionPopover } from "./SelectionPopover";
import { TopBar } from "./TopBar";
import { getEffectiveReaderPreferences, toReaderPreferences, type ReaderPreferences } from "./readerPreferences";
import { selectionBridge, type ReaderSelection } from "./selectionBridge";
import { findTocLabelBySpineItemId, findTocPathBySpineItemId } from "./tocTree";

type ReaderPageProps = {
  ai?: Pick<AiService, "explainSelection" | "translateSelection">;
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

type LocationTargetIntent = "explicit" | "restored";

const continuousTtsChunkOptions = { firstSegmentMax: 280, segmentMax: 500 } as const;
const paginatedInitialMarkerFallbackMs = 700;
const recentReleasedSelectionWindowMs = 5000;

function getSelectionCacheKey(selection: ReaderSelection | null) {
  const text = selection?.text.trim() ?? "";
  if (!text) {
    return "";
  }

  return [selection?.spineItemId ?? "", selection?.cfiRange ?? "", text].join("::");
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

async function getContinuousTtsChunks(runtimeHandle: RuntimeRenderHandle, readingMode: ReadingMode) {
  try {
    const ttsBlocks = await runtimeHandle.getTtsBlocksFromCurrentLocation?.();
    if (ttsBlocks?.length) {
      return getContinuousTtsChunksFromBlocks(ttsBlocks, readingMode);
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

function getContinuousTtsChunksFromBlocks(blocks: RuntimeTtsBlock[], readingMode: ReadingMode) {
  if (!blocks.length) {
    return [];
  }

  if (readingMode === "paginated") {
    return blocks.flatMap((block) => chunkTextSegmentsFromBlocks([block], continuousTtsChunkOptions));
  }

  return chunkTextSegmentsFromBlocks(blocks, continuousTtsChunkOptions);
}

async function getContinuousTtsChunksFromTarget(
  runtimeHandle: RuntimeRenderHandle,
  readingMode: ReadingMode,
  target: string,
) {
  if (!target.trim()) {
    return [];
  }

  try {
    const ttsBlocks = await runtimeHandle.getTtsBlocksFromTarget?.(target);
    if (ttsBlocks?.length) {
      let headingBlockCount = 0;
      while (headingBlockCount < ttsBlocks.length && isHeadingTtsBlock(ttsBlocks[headingBlockCount])) {
        headingBlockCount += 1;
      }

      if (headingBlockCount > 0) {
        return [
          ...chunkTextSegmentsFromBlocks(ttsBlocks.slice(0, headingBlockCount), continuousTtsChunkOptions),
          ...getContinuousTtsChunksFromBlocks(ttsBlocks.slice(headingBlockCount), readingMode),
        ];
      }

      return getContinuousTtsChunksFromBlocks(ttsBlocks, readingMode);
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
) {
  const cfiRange = selection?.cfiRange?.trim() ?? "";
  if (!cfiRange) {
    return [];
  }

  try {
    const ttsBlocks = await runtimeHandle.getTtsBlocksFromSelectionStart?.(cfiRange);
    if (ttsBlocks?.length) {
      return getContinuousTtsChunksFromBlocks(ttsBlocks, readingMode);
    }
  } catch {
    return [];
  }

  return [];
}

export function ReaderPage({ ai = aiService, phonetics, runtime }: ReaderPageProps) {
  const { bookId } = useParams<{ bookId: string }>();
  const shellContext = useOutletContext<ReaderAppShellContext | null>() ?? null;
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
  const [explanation, setExplanation] = useState("");
  const [explanationError, setExplanationError] = useState("");
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
  const runtimeHandleValueRef = useRef<RuntimeRenderHandle | null>(null);
  const aiRequestVersionRef = useRef(0);
  const lastAutoTranslatedSelectionKeyRef = useRef("");
  const activeSelectionSpeechRequestRef = useRef(0);
  const continuousSpineItemIdRef = useRef("");
  const continuousChunksRef = useRef<ChunkSegment[]>([]);
  const continuousSessionActiveRef = useRef(false);
  const continuousAdvanceInFlightRef = useRef(false);
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
    const applyResolvedProgress = (progress: ProgressRecord | null) => {
      setInitialProgress(progress ?? null);
      setInitialCfi(progress?.cfi);
      setLocationTarget(progress?.cfi);
      setLocationTargetIntent("restored");
      setExplicitLocationTarget(undefined);
      setPreferExactViewportTarget(false);
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

    void Promise.all([getContinuousTtsChunks(runtimeHandle, settings.readingMode), browserTtsClientRef.current.getVoices()])
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
    const nextText = selectedSelection?.text.trim() ?? "";
    if (!nextText || selectedSelection?.isReleased === false) {
      return;
    }

    const selectionKey = [selectedSelection?.spineItemId ?? "", selectedSelection?.cfiRange ?? "", nextText].join(
      "::",
    );

    if (lastAutoTranslatedSelectionKeyRef.current === selectionKey) {
      return;
    }

    lastAutoTranslatedSelectionKeyRef.current = selectionKey;
    void requestTranslation(nextText, selectedSelection?.sentenceContext);
    if (isAutoSpeakableSelection(nextText)) {
      void startSelectionSpeech(nextText);
    }
  }, [selectedSelection]);

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
          }
        : null;

      if (immediateLocation?.cfi) {
        writeRefreshProgressSnapshot(bookId, immediateLocation);
      }

      void (async () => {
        const runtimeLocation = await runtimeHandle?.getCurrentLocation?.();
        const nextLocation = runtimeLocation ?? immediateLocation;
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
        const nextSpineItemId = nextLocation?.spineItemId ?? currentLocationRef.current.spineItemId;
        const nextChunks = await getContinuousTtsChunks(runtimeHandle, settingsRef.current.readingMode);
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

  async function requestTranslation(text: string, sentenceContext?: string) {
    const nextText = text.trim();
    if (!nextText) {
      return;
    }

    const requestVersion = ++aiRequestVersionRef.current;
    const ipaWord = getEligibleIpaWord(nextText);
    setTranslationError("");
    setExplanation("");
    setExplanationError("");
    setAiIpa("");
    setTranslation("");

    try {
      const [result, ipa] = await Promise.all([
        ai.translateSelection(nextText, {
          sentenceContext,
          targetLanguage: settings.targetLanguage || navigator.language || "zh-CN",
        }),
        ipaWord ? phoneticsServiceRef.current.lookupIpa(ipaWord) : Promise.resolve(null),
      ]);
      if (aiRequestVersionRef.current !== requestVersion) {
        return;
      }
      setTranslation(result);
      setAiIpa(ipa ?? "");
    } catch (error) {
      if (aiRequestVersionRef.current !== requestVersion) {
        return;
      }
      setTranslationError(`Translate failed: ${String(error)}`);
    }
  }

  async function requestExplanation(text: string) {
    const nextText = text.trim();
    if (!nextText) {
      return;
    }

    const requestVersion = ++aiRequestVersionRef.current;
    setExplanation("");
    setExplanationError("");

    try {
      const result = await ai.explainSelection(nextText, {
        targetLanguage: settings.targetLanguage || navigator.language || "zh-CN",
      });
      if (aiRequestVersionRef.current !== requestVersion) {
        return;
      }
      setExplanation(result);
    } catch (error) {
      if (aiRequestVersionRef.current !== requestVersion) {
        return;
      }
      setExplanationError(`Explain failed: ${String(error)}`);
    }
  }

  async function startSelectionSpeech(text: string) {
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

      if (activeSelectionSpeechRequestRef.current !== requestId) {
        return;
      }
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
    } catch (error) {
      if (activeSelectionSpeechRequestRef.current !== requestId) {
        return;
      }

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
    await requestTranslation(selectedText, selectedSelection?.sentenceContext);
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

  async function handleTranslationProviderChange(translationProvider: TranslationProvider) {
    await updateSettings({ translationProvider });
  }

  async function handleLocalLlmModelChange(localLlmModel: string) {
    await updateSettings({ localLlmModel });
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

  function getRecentReleasedSelectionFallback() {
    if (Date.now() - lastReleasedSelectionAtRef.current > recentReleasedSelectionWindowMs) {
      return null;
    }

    return lastReleasedSelectionRef.current?.text.trim() ? lastReleasedSelectionRef.current : null;
  }

  function handlePrepareStartTts() {
    const latestSelection =
      runtimeHandleValueRef.current?.getCurrentSelectionSnapshot?.() ??
      selectionBridge.read() ??
      selectedSelection ??
      getRecentReleasedSelectionFallback();
    pendingPointerStartSelectionRef.current = latestSelection?.text.trim() ? latestSelection : null;
    pendingPointerStartBlocksPromiseRef.current = runtimeHandleValueRef.current?.getTtsBlocksFromCurrentSelection?.() ?? null;
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
    const selectionSnapshotChunks = latestSelection?.ttsBlocks?.length
      ? getContinuousTtsChunksFromBlocks(latestSelection.ttsBlocks, settings.readingMode)
      : [];
    const latestSelectionKey = getSelectionCacheKey(latestSelection);
    const cachedSelectionBlocks =
      latestSelectionKey && cachedSelectionBlocksKeyRef.current === latestSelectionKey
        ? (await cachedSelectionBlocksPromiseRef.current?.catch(() => [])) ?? []
        : [];
    pendingPointerStartSelectionRef.current = null;
    pendingPointerStartBlocksPromiseRef.current = null;
    const pointerSelectionDrivenChunks = pendingPointerStartBlocks.length
      ? getContinuousTtsChunksFromBlocks(pendingPointerStartBlocks, settings.readingMode)
      : [];
    const cachedSelectionDrivenChunks = cachedSelectionBlocks.length
      ? getContinuousTtsChunksFromBlocks(cachedSelectionBlocks, settings.readingMode)
      : [];
    const selectionDrivenChunks = pointerSelectionDrivenChunks.length
      ? pointerSelectionDrivenChunks
      : selectionSnapshotChunks.length
        ? selectionSnapshotChunks
      : cachedSelectionDrivenChunks.length
        ? cachedSelectionDrivenChunks
      : await getContinuousTtsChunksFromSelection(runtimeHandle, settings.readingMode, latestSelection);
    const pendingStartTarget = pendingTtsStartTargetRef.current.trim();
    let targetDrivenChunks: ChunkSegment[] = [];
    if (!selectionDrivenChunks.length && pendingStartTarget) {
      try {
        await runtimeHandle.goTo(pendingStartTarget);
      } catch {
        // Fall back to the currently rendered location if the explicit target cannot be re-opened.
      }
      targetDrivenChunks = await getContinuousTtsChunksFromTarget(runtimeHandle, settings.readingMode, pendingStartTarget);
    }
    const chunks = selectionDrivenChunks.length
      ? selectionDrivenChunks
      : targetDrivenChunks.length
        ? targetDrivenChunks
        : await getContinuousTtsChunks(runtimeHandle, settings.readingMode);

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

    activeSelectionSpeechRequestRef.current += 1;
    startContinuousQueue(chunks, currentSpineItemId);
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
  const activeContinuousTtsSegment: ActiveTtsSegment | null =
    ttsState.mode === "continuous" && ttsState.status !== "idle" && ttsState.markerText && continuousSpineItemIdRef.current
      ? {
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
        }
      : null;
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

  function navigateToLocation(target: string) {
    pendingTtsStartTargetRef.current = target;
    setLocationTargetIntent("explicit");
    setExplicitLocationTarget(target);
    if (bookId) {
      writeRefreshTtsStartTargetSnapshot(bookId, target);
      writeRefreshProgressSnapshot(bookId, {
        cfi: target,
        progress: currentLocationRef.current.progress,
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
    <main className={`reader-layout theme-${settings.theme}`} style={readerStyle}>
      <LeftRail
        bookmarks={bookmarkItems}
        currentSpineItemId={currentSpineItemId}
        highlights={highlights}
        notes={notes}
        onNavigateToBookmark={navigateToLocation}
        onRemoveHighlight={handleRemoveHighlight}
        onNavigateToTocItem={navigateToLocation}
        toc={toc}
      />
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
          readingMode={settings.readingMode}
          sectionPath={currentSectionPath}
          systemActions={
            shellContext ? (
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
            ) : null
          }
          selectionActions={
            <SelectionPopover
              hasSelection={selectedText.length > 0}
              onAddNote={handleAddNote}
              onExplain={handleExplain}
              onHighlight={handleHighlight}
              onReadAloud={handleReadAloud}
              onTranslate={handleTranslate}
            />
          }
        />
        <div className="reader-workspace">
          <section className="reader-stage" aria-label="Reader stage">
            {shouldRenderViewport ? (
              <EpubViewport
                activeTtsSegment={activeContinuousTtsSegment}
                bookId={bookId}
                initialCfi={nextInitialCfi}
                initialProgress={initialProgress}
                preferExactInitialTarget={preferExactViewportTarget}
                onLocationChange={({ cfi, pageIndex, pageOffset, progress, sectionPath, scrollTop, spineItemId, textQuote }) => {
                  if (bookId) {
                    writeRefreshProgressSnapshot(bookId, {
                      cfi,
                      pageIndex,
                      pageOffset,
                      progress,
                      scrollTop,
                      spineItemId,
                      textQuote,
                    });
                  }
                  setCurrentLocation({ cfi, pageIndex, pageOffset, progress, sectionPath, scrollTop, spineItemId, textQuote });
                  setCurrentSpineItemId(spineItemId);
                }}
                onReady={setRuntimeHandle}
                onStatusChange={setReaderStatus}
                onTocChange={setToc}
                readerPreferences={readerPreferences}
                readingMode={settings.readingMode}
                runtime={runtime}
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
          </section>
          <RightPanel
            apiKey={settings.apiKey}
            aiIpa={aiIpa}
            annotationCount={visibleAnnotations.length}
            appearance={readerPreferences}
            aria-label="Reader tools"
            explanation={explanation}
            explanationError={explanationError}
            geminiModel={settings.geminiModel}
            llmApiUrl={settings.llmApiUrl}
            localLlmModel={settings.localLlmModel}
            noteDraft={noteDraft}
            noteOpen={noteOpen}
            onApiKeyChange={handleApiKeyChange}
            onAppearanceChange={handleAppearanceChange}
            onGeminiModelChange={handleGeminiModelChange}
            onLlmApiUrlChange={handleLlmApiUrlChange}
            onLocalLlmModelChange={handleLocalLlmModelChange}
            onNoteDraftChange={setNoteDraft}
            onNoteSave={handleSaveNote}
            onTtsPause={handlePauseTts}
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
            translationError={translationError}
            translationProvider={settings.translationProvider}
            ttsCurrentText={ttsState.currentText}
            ttsError={ttsState.error}
            ttsRate={settings.ttsRate}
            ttsStartDisabled={!ttsStartReady}
            ttsStatus={ttsState.status}
            ttsVoice={settings.ttsVoice}
            ttsVoices={ttsVoices}
            ttsVolume={settings.ttsVolume}
          />
        </div>
      </section>
    </main>
  );
}
