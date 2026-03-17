import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import type { AnnotationRecord, BookmarkRecord } from "../../lib/types/annotations";
import type { ProgressRecord, TocItem } from "../../lib/types/books";
import type { ReadingMode, SettingsInput } from "../../lib/types/settings";
import { aiService, type AiService } from "../ai/aiService";
import { annotationService } from "../annotations/annotationService";
import { getProgress } from "../bookshelf/progressRepository";
import { defaultSettings, getResolvedSettings, saveSettings } from "../settings/settingsRepository";
import { createBrowserTtsClient } from "../tts/browserTtsClient";
import { chunkTextSegments, chunkTextSegmentsFromBlocks } from "../tts/chunkText";
import { createTtsQueue } from "../tts/ttsQueue";
import "./reader.css";
import { EpubViewport } from "./EpubViewport";
import type { ActiveTtsSegment, EpubViewportRuntime, RuntimeRenderHandle } from "./epubRuntime";
import { LeftRail } from "./LeftRail";
import { RightPanel } from "./RightPanel";
import { SelectionPopover } from "./SelectionPopover";
import { TopBar } from "./TopBar";
import { toReaderPreferences, type ReaderPreferences } from "./readerPreferences";
import { selectionBridge, type ReaderSelection } from "./selectionBridge";

type ReaderPageProps = {
  ai?: Pick<AiService, "explainSelection" | "translateSelection">;
  runtime?: EpubViewportRuntime;
};

type ReaderTtsState = {
  currentText: string;
  error: string;
  markerText: string;
  mode: "continuous" | "idle" | "selection";
  status: "error" | "idle" | "loading" | "paused" | "playing";
};

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
  const ttsBlocks = await runtimeHandle.getTtsBlocksFromCurrentLocation?.();
  if (ttsBlocks?.length) {
    return chunkTextSegmentsFromBlocks(
      ttsBlocks.map((block) => block.text),
      { firstSegmentMax: 280, segmentMax: 500 },
    );
  }

  const text = await runtimeHandle.getTextFromCurrentLocation();
  return chunkTextSegments(text, { firstSegmentMax: 280, segmentMax: 500 });
}

export function ReaderPage({ ai = aiService, runtime }: ReaderPageProps) {
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
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [aiTitle, setAiTitle] = useState("AI result");
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [currentLocation, setCurrentLocation] = useState({ cfi: "", progress: 0, spineItemId: "" });
  const [noteDraft, setNoteDraft] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [runtimeHandle, setRuntimeHandle] = useState<RuntimeRenderHandle | null>(null);
  const [visibleAnnotations, setVisibleAnnotations] = useState<AnnotationRecord[]>([]);
  const [settings, setSettings] = useState<SettingsInput>(defaultSettings);
  const [ttsStartReady, setTtsStartReady] = useState(false);
  const [ttsState, setTtsState] = useState<ReaderTtsState>({
    currentText: "",
    error: "",
    markerText: "",
    mode: "idle",
    status: "idle",
  });
  const settingsDirtyRef = useRef(false);
  const aiRequestVersionRef = useRef(0);
  const lastAutoTranslatedSelectionKeyRef = useRef("");
  const activeSelectionSpeechRequestRef = useRef(0);
  const continuousSpineItemIdRef = useRef("");
  const ttsReadinessRequestRef = useRef(0);
  const browserTtsClientRef = useRef(createBrowserTtsClient());
  const ttsQueueRef = useRef<ReturnType<typeof createTtsQueue> | null>(null);

  function ensureTtsQueue() {
    if (!ttsQueueRef.current) {
      ttsQueueRef.current = createTtsQueue({
        client: browserTtsClientRef.current,
        onStateChange(nextState) {
          setTtsState((currentState) => ({
            ...currentState,
            currentText: nextState.currentText,
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
      setCurrentLocation({ cfi: "", progress: 0, spineItemId: "" });
      setCurrentSpineItemId("");
      setReaderStatus("Open a book from the shelf to start reading.");
      return;
    }

    setIsProgressReady(false);
    setInitialCfi(undefined);
    setInitialProgress(null);
    setLocationTarget(undefined);
    setCurrentLocation({ cfi: "", progress: 0, spineItemId: "" });
    setCurrentSpineItemId("");
    setReaderStatus("Restoring reading position...");

    void getProgress(bookId)
      .then((progress) => {
        if (cancelled) {
          return;
        }

        setInitialProgress(progress ?? null);
        setInitialCfi(progress?.cfi);
        setLocationTarget(progress?.cfi);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setInitialProgress(null);
        setInitialCfi(undefined);
        setLocationTarget(undefined);
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
    void getResolvedSettings().then((nextSettings) => {
      if (!settingsDirtyRef.current) {
        setSettings({ ...defaultSettings, ...nextSettings });
      }
    });
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
    if (!runtimeHandle || typeof runtimeHandle.applyPreferences !== "function") {
      return;
    }

    void runtimeHandle.applyPreferences(toReaderPreferences(settings));
  }, [runtimeHandle, settings]);

  useEffect(() => {
    const requestId = ++ttsReadinessRequestRef.current;

    if (!runtimeHandle) {
      setTtsStartReady(false);
      return;
    }

    setTtsStartReady(false);

    if (!isEdgeDesktopBrowser(globalThis.navigator?.userAgent ?? "")) {
      setTtsState({
        currentText: "",
        error: "TTS is optimized for Microsoft Edge on desktop.",
        markerText: "",
        mode: "idle",
        status: "error",
      });
      return;
    }

    void Promise.all([getContinuousTtsChunks(runtimeHandle), browserTtsClientRef.current.getVoices()])
      .then(([chunks, voices]) => {
        if (ttsReadinessRequestRef.current !== requestId) {
          return;
        }

        if (!voices.length) {
          setTtsStartReady(false);
          setTtsState({
            currentText: "",
            error: "No compatible Edge English voices detected.",
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
                currentText: "",
                error: "",
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

        setTtsStartReady(false);
        setTtsState((currentState) =>
          currentState.mode === "idle"
            ? {
                currentText: "",
                error: "Browser speech synthesis unavailable.",
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
      setAiError("");

      if (!selection?.text.trim()) {
        lastAutoTranslatedSelectionKeyRef.current = "";
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const nextText = selectedSelection?.text.trim() ?? "";
    if (!nextText) {
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
        currentText: "",
        error: "Reading position changed.",
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
    setAiTitle("Translation");
    setAiError("");
    setAiResult("");

    try {
      const result = await ai.translateSelection(nextText, {
        targetLanguage: settings.targetLanguage || navigator.language || "zh-CN",
      });
      if (aiRequestVersionRef.current !== requestVersion) {
        return;
      }
      setAiResult(result);
    } catch (error) {
      if (aiRequestVersionRef.current !== requestVersion) {
        return;
      }
      setAiError(`Translate failed: ${String(error)}`);
    }
  }

  async function requestExplanation(text: string) {
    const nextText = text.trim();
    if (!nextText) {
      return;
    }

    const requestVersion = ++aiRequestVersionRef.current;
    setAiTitle("Explanation");
    setAiError("");
    setAiResult("");

    try {
      const result = await ai.explainSelection(nextText, {
        targetLanguage: settings.targetLanguage || navigator.language || "zh-CN",
      });
      if (aiRequestVersionRef.current !== requestVersion) {
        return;
      }
      setAiResult(result);
    } catch (error) {
      if (aiRequestVersionRef.current !== requestVersion) {
        return;
      }
      setAiError(`Explain failed: ${String(error)}`);
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
      currentText: nextText,
      error: "",
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
            currentText: "",
            error: "",
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
            currentText: nextText,
            error: `TTS failed: ${formatTtsError(error)}`,
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
        currentText: nextText,
        error: "",
        markerText: "",
        mode: "selection",
        status: "playing",
      });
    } catch (error) {
      if (activeSelectionSpeechRequestRef.current !== requestId) {
        return;
      }

      setTtsState({
        currentText: nextText,
        error: `TTS failed: ${formatTtsError(error)}`,
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
    const nextSettings = { ...settings, ...patch };
    settingsDirtyRef.current = true;
    setSettings(nextSettings);
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
  }

  async function handleStartTts() {
    if (!runtimeHandle || !ttsStartReady) {
      return;
    }

    const queue = ensureTtsQueue();
    const chunks = await getContinuousTtsChunks(runtimeHandle);

    if (!chunks.length) {
      setTtsState({
        currentText: "",
        error: "No readable text is available from the current location.",
        markerText: "",
        mode: "idle",
        status: "error",
      });
      return;
    }

    activeSelectionSpeechRequestRef.current += 1;
    continuousSpineItemIdRef.current = currentSpineItemId;
    browserTtsClientRef.current.stop();
    setTtsState({
      currentText: chunks[0]?.text ?? "",
      error: "",
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
    if (ttsState.mode === "continuous") {
      ttsQueueRef.current?.stop();
    } else {
      browserTtsClientRef.current.stop();
      setTtsState({
        currentText: "",
        error: "",
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
          spineItemId: continuousSpineItemIdRef.current,
          text: ttsState.markerText,
        }
      : null;
  const readerStyle: CSSProperties & Record<"--reader-font-scale", string> = {
    "--reader-font-scale": String(settings.fontScale),
  };
  const shouldRenderViewport = Boolean(bookId) && isProgressReady;
  const nextInitialCfi = locationTarget ?? initialCfi;

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
                onLocationChange={({ cfi, progress, spineItemId }) => {
                  setCurrentLocation({ cfi, progress, spineItemId });
                  setCurrentSpineItemId(spineItemId);
                }}
                onReady={setRuntimeHandle}
                onStatusChange={setReaderStatus}
                onTocChange={setToc}
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
            aiError={aiError}
            aiResult={aiResult}
            aiTitle={aiTitle}
            annotationCount={visibleAnnotations.length}
            appearance={toReaderPreferences(settings)}
            aria-label="Reader tools"
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
            readerStatus={readerStatus}
            selectedText={selectedText}
            ttsCurrentText={ttsState.currentText}
            ttsError={ttsState.error}
            ttsRate={settings.ttsRate}
            ttsStartDisabled={!ttsStartReady}
            ttsStatus={ttsState.status}
          />
        </div>
      </section>
    </main>
  );
}
