import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import type { AnnotationRecord, BookmarkRecord } from "../../lib/types/annotations";
import type { ProgressRecord, TocItem } from "../../lib/types/books";
import type { ReadingMode, SettingsInput } from "../../lib/types/settings";
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
import type { ActiveTtsSegment, EpubViewportRuntime, RuntimeRenderHandle } from "./epubRuntime";
import {
  readRefreshProgressSnapshot,
  resolvePreferredProgress,
  writeRefreshProgressSnapshot,
} from "./refreshProgressSnapshot";
import { LeftRail } from "./LeftRail";
import { RightPanel } from "./RightPanel";
import { SelectionPopover } from "./SelectionPopover";
import { TopBar } from "./TopBar";
import { getEffectiveReaderPreferences, toReaderPreferences, type ReaderPreferences } from "./readerPreferences";
import { selectionBridge, type ReaderSelection } from "./selectionBridge";

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
  markerIndex: number;
  markerText: string;
  mode: "continuous" | "idle" | "selection";
  status: "error" | "idle" | "loading" | "paused" | "playing";
};

type ReaderLocationState = {
  cfi: string;
  pageIndex?: number;
  pageOffset?: number;
  progress: number;
  spineItemId: string;
  textQuote: string;
};

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

function isEdgeDesktopBrowser(userAgent: string) {
  return /Edg\//.test(userAgent) && !/(Android|iPhone|iPad|Mobile)/i.test(userAgent);
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

async function getContinuousTtsChunks(runtimeHandle: RuntimeRenderHandle) {
  try {
    const ttsBlocks = await runtimeHandle.getTtsBlocksFromCurrentLocation?.();
    if (ttsBlocks?.length) {
      return chunkTextSegmentsFromBlocks(ttsBlocks, { firstSegmentMax: 280, segmentMax: 500 });
    }
  } catch {
    // Fall back to flattened text extraction when paragraph-aware markers are unavailable.
  }

  try {
    const text = await runtimeHandle.getTextFromCurrentLocation();
    return chunkTextSegments(text, { firstSegmentMax: 280, segmentMax: 500 });
  } catch {
    return [];
  }
}

export function ReaderPage({ ai = aiService, phonetics, runtime }: ReaderPageProps) {
  const { bookId } = useParams<{ bookId: string }>();
  const [initialCfi, setInitialCfi] = useState<string>();
  const [initialProgress, setInitialProgress] = useState<ProgressRecord | null>(null);
  const [isProgressReady, setIsProgressReady] = useState(!bookId);
  const [locationTarget, setLocationTarget] = useState<string>();
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
  const aiRequestVersionRef = useRef(0);
  const lastAutoTranslatedSelectionKeyRef = useRef("");
  const activeSelectionSpeechRequestRef = useRef(0);
  const continuousSpineItemIdRef = useRef("");
  const continuousChunksRef = useRef<ChunkSegment[]>([]);
  const lastAutoPagedCfiRef = useRef("");
  const ttsReadinessRequestRef = useRef(0);
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
            markerIndex: nextState.markerIndex,
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
      setInitialCfi(undefined);
      setInitialProgress(null);
      setIsProgressReady(true);
      setLocationTarget(undefined);
      setCurrentLocation({ cfi: "", pageIndex: undefined, pageOffset: undefined, progress: 0, spineItemId: "", textQuote: "" });
      setCurrentSpineItemId("");
      setReaderStatus("Open a book from the shelf to start reading.");
      return;
    }

    setIsProgressReady(false);
    setInitialCfi(undefined);
    setInitialProgress(null);
    setLocationTarget(undefined);
    setCurrentLocation({ cfi: "", pageIndex: undefined, pageOffset: undefined, progress: 0, spineItemId: "", textQuote: "" });
    setCurrentSpineItemId("");
    setReaderStatus("Restoring reading position...");

    const refreshSnapshot = readRefreshProgressSnapshot(bookId);
    const applyResolvedProgress = (progress: ProgressRecord | null) => {
      setInitialProgress(progress ?? null);
      setInitialCfi(progress?.cfi);
      setLocationTarget(progress?.cfi);
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
    function handleKeydown(event: KeyboardEvent) {
      if (settings.readingMode !== "paginated" || !runtimeHandle) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") {
        return;
      }

      if (event.key === "ArrowRight" || event.key === "PageDown" || (event.key === " " && !event.shiftKey)) {
        event.preventDefault();
        void runtimeHandle.next();
      }

      if (event.key === "ArrowLeft" || event.key === "PageUp" || (event.key === " " && event.shiftKey)) {
        event.preventDefault();
        void runtimeHandle.prev();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [runtimeHandle, settings.readingMode]);

  useEffect(() => {
    const requestId = ++ttsReadinessRequestRef.current;

    if (!runtimeHandle) {
      setTtsStartReady(false);
      setTtsVoices([]);
      return;
    }

    setTtsStartReady(false);

    if (!isEdgeDesktopBrowser(globalThis.navigator?.userAgent ?? "")) {
      setTtsState({
        chunkIndex: -1,
        currentText: "",
        error: "TTS is optimized for Microsoft Edge on desktop.",
        markerCfi: "",
        markerIndex: -1,
        markerText: "",
        mode: "idle",
        status: "error",
      });
      setTtsVoices([]);
      return;
    }

    void Promise.all([getContinuousTtsChunks(runtimeHandle), browserTtsClientRef.current.getVoices()])
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
            error: "No compatible Edge English voices detected.",
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
    void requestTranslation(nextText);
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
  }, [bookId, currentLocation, runtimeHandle]);

  useEffect(() => {
    function flushReaderSettings() {
      writeRefreshSettingsSnapshot(settings);
    }

    window.addEventListener("pagehide", flushReaderSettings);
    window.addEventListener("beforeunload", flushReaderSettings);
    return () => {
      window.removeEventListener("pagehide", flushReaderSettings);
      window.removeEventListener("beforeunload", flushReaderSettings);
    };
  }, [settings]);

  useEffect(() => {
    if (
      settings.readingMode !== "paginated" ||
      ttsState.mode !== "continuous" ||
      ttsState.status === "idle" ||
      !runtimeHandle ||
      !ttsState.markerCfi
    ) {
      return;
    }

    if (ttsState.markerCfi === currentLocation.cfi || lastAutoPagedCfiRef.current === ttsState.markerCfi) {
      return;
    }

    lastAutoPagedCfiRef.current = ttsState.markerCfi;
    void runtimeHandle.goTo(ttsState.markerCfi);
  }, [currentLocation.cfi, runtimeHandle, settings.readingMode, ttsState.markerCfi, ttsState.mode, ttsState.status]);

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

  async function requestTranslation(text: string) {
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
    continuousSpineItemIdRef.current = "";
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
    await requestTranslation(selectedText);
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
    await updateSettings({ readingMode: mode });
  }

  async function handleAppearanceChange(patch: Partial<ReaderPreferences>) {
    await updateSettings(patch);
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

  async function handleStartTts() {
    if (!runtimeHandle || !ttsStartReady) {
      return;
    }

    const queue = ensureTtsQueue();
    const chunks = await getContinuousTtsChunks(runtimeHandle);

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

    activeSelectionSpeechRequestRef.current += 1;
    continuousSpineItemIdRef.current = currentSpineItemId;
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

    void queue.start({
      chunks,
      request: {
        rate: settings.ttsRate,
        voiceId: settings.ttsVoice,
        volume: settings.ttsVolume,
      },
    });
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
    label: toc.find((item) => item.id === bookmark.spineItemId)?.label ?? `Saved location ${index + 1}`,
  }));
  const isCurrentLocationBookmarked = bookmarks.some((bookmark) => bookmark.cfi === currentLocation.cfi);
  const activeContinuousTtsSegment: ActiveTtsSegment | null =
    ttsState.mode === "continuous" && ttsState.status !== "idle" && ttsState.markerText && continuousSpineItemIdRef.current
      ? {
          cfi: ttsState.markerCfi || undefined,
          spineItemId: continuousSpineItemIdRef.current,
          text: ttsState.markerText,
        }
      : null;
  const readerPreferences = getEffectiveReaderPreferences(toReaderPreferences(settings));
  const readerStyle: CSSProperties & Record<"--reader-font-scale", string> = {
    "--reader-font-scale": String(settings.fontScale),
  };
  const shouldRenderViewport = Boolean(bookId) && isProgressReady && isSettingsReady;
  const nextInitialCfi = locationTarget ?? initialCfi;

  useEffect(() => {
    if (!runtimeHandle || typeof runtimeHandle.applyPreferences !== "function") {
      return;
    }

    void runtimeHandle.applyPreferences(readerPreferences);
  }, [readerPreferences, runtimeHandle]);

  return (
    <main className={`reader-layout theme-${settings.theme}`} style={readerStyle}>
      <LeftRail
        bookmarks={bookmarkItems}
        highlights={highlights}
        notes={notes}
        onNavigateToBookmark={setLocationTarget}
        onRemoveHighlight={handleRemoveHighlight}
        onNavigateToTocItem={setLocationTarget}
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
        />
        <div className="reader-workspace">
          <section className="reader-stage" aria-label="Reader stage">
            {shouldRenderViewport ? (
              <EpubViewport
                activeTtsSegment={activeContinuousTtsSegment}
                bookId={bookId}
                initialCfi={nextInitialCfi}
                initialProgress={initialProgress}
                onLocationChange={({ cfi, pageIndex, pageOffset, progress, spineItemId, textQuote }) => {
                  if (bookId) {
                    writeRefreshProgressSnapshot(bookId, { cfi, pageIndex, pageOffset, progress, spineItemId, textQuote });
                  }
                  setCurrentLocation({ cfi, pageIndex, pageOffset, progress, spineItemId, textQuote });
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
            <SelectionPopover
              hasSelection={selectedText.length > 0}
              onAddNote={handleAddNote}
              onExplain={handleExplain}
              onHighlight={handleHighlight}
              onReadAloud={handleReadAloud}
              onTranslate={handleTranslate}
            />
          </section>
          <RightPanel
            aiIpa={aiIpa}
            annotationCount={visibleAnnotations.length}
            appearance={readerPreferences}
            aria-label="Reader tools"
            explanation={explanation}
            explanationError={explanationError}
            noteDraft={noteDraft}
            noteOpen={noteOpen}
            onAppearanceChange={handleAppearanceChange}
            onNoteDraftChange={setNoteDraft}
            onNoteSave={handleSaveNote}
            onTtsPause={handlePauseTts}
            onTtsRateChange={handleQuickTtsRateChange}
            onTtsResume={handleResumeTts}
            onTtsStart={handleStartTts}
            onTtsStop={handleStopTts}
            onTtsVoiceChange={handleTtsVoiceChange}
            onTtsVolumeChange={handleTtsVolumeChange}
            readerStatus={readerStatus}
            selectedText={selectedText}
            translation={translation}
            translationError={translationError}
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
