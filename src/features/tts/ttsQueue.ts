import type { BrowserTtsSpeakOptions } from "./browserTtsClient";
import type { ChunkSegment } from "./chunkText";

type TtsQueueClient = {
  pause(): void;
  resume(): void;
  speakSelection(text: string, options: BrowserTtsSpeakOptions): Promise<void>;
  stop(): void;
};

type TtsQueueDeps = {
  client: TtsQueueClient;
  onStateChange?: (state: TtsQueueState) => void;
};

export type TtsQueueState = {
  chunkIndex: number;
  currentText: string;
  markerCfi: string;
  markerEndOffset: number;
  markerIndex: number;
  markerLocatorText: string;
  markerStartOffset: number;
  markerText: string;
  status: "idle" | "loading" | "playing" | "paused" | "error";
};

type StartArgs = {
  chunks: Array<ChunkSegment | string>;
  request: Omit<BrowserTtsSpeakOptions, "onEnd" | "onError">;
};

export type TtsQueueChunk = ChunkSegment;

const INITIAL_MARKER_FALLBACK_MS = 250;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function isSpokenTokenCharacter(character: string) {
  return /[\p{L}\p{N}'’-]/u.test(character);
}

function isWordBoundaryEvent(event: SpeechSynthesisEvent) {
  const boundaryName = typeof event.name === "string" ? event.name.toLowerCase() : "";
  return !boundaryName || boundaryName === "word";
}

function resolveBoundaryWord(text: string, charIndex = 0) {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return {
      end: 0,
      start: 0,
      text: "",
    };
  }

  let cursor = clamp(charIndex, 0, Math.max(0, text.length - 1));
  if (!isSpokenTokenCharacter(text[cursor] ?? "")) {
    let forward = cursor;
    while (forward < text.length && !isSpokenTokenCharacter(text[forward] ?? "")) {
      forward += 1;
    }

    if (forward < text.length) {
      cursor = forward;
    } else {
      let backward = cursor;
      while (backward >= 0 && !isSpokenTokenCharacter(text[backward] ?? "")) {
        backward -= 1;
      }

      if (backward < 0) {
        return {
          end: normalizedText.length,
          start: 0,
          text: normalizedText,
        };
      }

      cursor = backward;
    }
  }

  let start = cursor;
  while (start > 0 && isSpokenTokenCharacter(text[start - 1] ?? "")) {
    start -= 1;
  }

  let end = cursor + 1;
  while (end < text.length && isSpokenTokenCharacter(text[end] ?? "")) {
    end += 1;
  }

  const resolvedText = text.slice(start, end).trim() || normalizedText;

  return {
    end: start + resolvedText.length,
    start,
    text: resolvedText,
  };
}

export function createTtsQueue({ client, onStateChange }: TtsQueueDeps) {
  let state: TtsQueueState = {
    chunkIndex: -1,
    currentText: "",
    markerCfi: "",
    markerEndOffset: -1,
    markerIndex: -1,
    markerLocatorText: "",
    markerStartOffset: -1,
    markerText: "",
    status: "idle",
  };
  let runId = 0;

  const normalizeChunk = (chunk: StartArgs["chunks"][number]): TtsQueueChunk =>
    typeof chunk === "string"
      ? {
          markers: [{ end: chunk.length, start: 0, text: chunk }],
          text: chunk,
        }
      : chunk;

  const resolveMarker = (chunk: TtsQueueChunk, charIndex = 0) => {
    const normalizedIndex = Math.max(0, Math.min(charIndex, chunk.text.length));
    const markerIndex = chunk.markers.findIndex(
      (candidate) => normalizedIndex >= candidate.start && normalizedIndex <= candidate.end,
    );
    const resolvedMarkerIndex = markerIndex >= 0 ? markerIndex : Math.max(0, chunk.markers.length - 1);
    const marker = chunk.markers[resolvedMarkerIndex];

    return {
      marker,
      markerIndex: resolvedMarkerIndex,
      markerText: marker?.text || chunk.text,
    };
  };

  const resolveHighlightText = (
    chunk: TtsQueueChunk,
    markerState: ReturnType<typeof resolveMarker>,
    charIndex = 0,
  ) => {
    const sourceText = markerState.marker?.text || chunk.text;
    if (!sourceText) {
      return {
        endOffset: -1,
        startOffset: -1,
        text: markerState.markerText,
      };
    }

    const relativeIndex = markerState.marker
      ? clamp(charIndex - markerState.marker.start, 0, Math.max(0, sourceText.length - 1))
      : clamp(charIndex, 0, Math.max(0, sourceText.length - 1));

    const resolvedWord = resolveBoundaryWord(sourceText, relativeIndex);
    const text = resolvedWord.text || markerState.markerText;
    const startOffsetInMarker = resolvedWord.start;
    const endOffsetInMarker = resolvedWord.end;
    const hasSourceOffsets =
      typeof markerState.marker?.sourceStart === "number" && typeof markerState.marker?.sourceEnd === "number";
    const baseOffset = hasSourceOffsets ? markerState.marker?.sourceStart ?? 0 : 0;

    return {
      endOffset: hasSourceOffsets ? baseOffset + endOffsetInMarker : -1,
      startOffset: hasSourceOffsets ? baseOffset + startOffsetInMarker : -1,
      text,
    };
  };

  const emitState = (nextState: TtsQueueState) => {
    state = nextState;
    onStateChange?.(nextState);
  };

  const chunkUsesSingleHighlightTarget = (chunk: TtsQueueChunk) => {
    if (chunk.markers.length <= 1) {
      return true;
    }

    const firstMarker = chunk.markers[0];
    return chunk.markers.every(
      (marker) => marker.cfi === firstMarker?.cfi && marker.spineItemId === firstMarker?.spineItemId,
    );
  };

  async function speakChunk(chunks: TtsQueueChunk[], index: number, request: StartArgs["request"], activeRunId: number) {
    if (activeRunId !== runId) {
      return;
    }

    const chunk = chunks[index];
    if (!chunk) {
      emitState({
        chunkIndex: -1,
        currentText: "",
        markerCfi: "",
        markerEndOffset: -1,
        markerIndex: -1,
        markerLocatorText: "",
        markerStartOffset: -1,
        markerText: "",
        status: "idle",
      });
      return;
    }

    const initialMarker = resolveMarker(chunk);
    const initialMarkerFallbackMs = Math.max(0, request.initialMarkerFallbackMs ?? INITIAL_MARKER_FALLBACK_MS);
    const revealInitialMarkerOnStart = chunkUsesSingleHighlightTarget(chunk);
    let initialMarkerVisible = false;
    let initialMarkerFallbackTimer: ReturnType<typeof setTimeout> | undefined;

    const clearInitialMarkerFallback = () => {
      if (initialMarkerFallbackTimer) {
        clearTimeout(initialMarkerFallbackTimer);
        initialMarkerFallbackTimer = undefined;
      }
    };

    const revealInitialMarker = () => {
      if (activeRunId !== runId || initialMarkerVisible) {
        return;
      }

      initialMarkerVisible = true;
      const initialHighlight = resolveHighlightText(chunk, initialMarker, 0);
      emitState({
        ...state,
        chunkIndex: index,
        currentText: chunk.text,
        markerCfi: initialMarker.marker?.cfi ?? "",
        markerEndOffset: initialHighlight.endOffset,
        markerIndex: initialMarker.markerIndex,
        markerLocatorText: initialMarker.marker?.locatorText ?? initialMarker.marker?.text ?? chunk.text,
        markerStartOffset: initialHighlight.startOffset,
        markerText: initialHighlight.text,
        status: "playing",
      });
    };

    emitState({
      chunkIndex: index,
      currentText: chunk.text,
      markerCfi: "",
      markerEndOffset: -1,
      markerIndex: -1,
      markerLocatorText: "",
      markerStartOffset: -1,
      markerText: "",
      status: "loading",
    });

    try {
      await client.speakSelection(chunk.text, {
        ...request,
        onStart: () => {
          if (activeRunId !== runId) {
            return;
          }

          if (revealInitialMarkerOnStart) {
            revealInitialMarker();
            return;
          }

          emitState({
            ...state,
            chunkIndex: index,
            currentText: chunk.text,
            markerCfi: "",
            markerEndOffset: -1,
            markerIndex: -1,
            markerLocatorText: "",
            markerStartOffset: -1,
            markerText: "",
            status: "playing",
          });

          clearInitialMarkerFallback();
          initialMarkerFallbackTimer = setTimeout(() => {
            revealInitialMarker();
          }, initialMarkerFallbackMs);
        },
        onBoundary: (event) => {
          if (activeRunId !== runId) {
            return;
          }

          if (!isWordBoundaryEvent(event)) {
            return;
          }

          clearInitialMarkerFallback();
          initialMarkerVisible = true;
          const nextMarker = resolveMarker(chunk, event.charIndex);
          const nextHighlight = resolveHighlightText(chunk, nextMarker, event.charIndex);

          emitState({
            ...state,
            chunkIndex: index,
            currentText: chunk.text,
            markerCfi: nextMarker.marker?.cfi ?? "",
            markerEndOffset: nextHighlight.endOffset,
            markerIndex: nextMarker.markerIndex,
            markerLocatorText: nextMarker.marker?.locatorText ?? nextMarker.marker?.text ?? chunk.text,
            markerStartOffset: nextHighlight.startOffset,
            markerText: nextHighlight.text,
            status: "playing",
          });
        },
        onEnd: () => {
          clearInitialMarkerFallback();
          void speakChunk(chunks, index + 1, request, activeRunId);
        },
        onError: () => {
          clearInitialMarkerFallback();
          if (activeRunId === runId) {
            emitState({
              chunkIndex: index,
              currentText: chunk.text,
              markerCfi: state.markerCfi || initialMarker.marker?.cfi || "",
              markerEndOffset: state.markerEndOffset >= 0 ? state.markerEndOffset : initialMarker.marker?.sourceEnd ?? -1,
              markerIndex: state.markerIndex >= 0 ? state.markerIndex : initialMarker.markerIndex,
              markerLocatorText:
                state.markerLocatorText || initialMarker.marker?.locatorText || initialMarker.marker?.text || chunk.text,
              markerStartOffset: state.markerStartOffset >= 0 ? state.markerStartOffset : initialMarker.marker?.sourceStart ?? -1,
              markerText: state.markerText || initialMarker.markerText,
              status: "error",
            });
          }
        },
      });
    } catch {
      clearInitialMarkerFallback();
      if (activeRunId === runId) {
        emitState({
          chunkIndex: index,
          currentText: chunk.text,
          markerCfi: state.markerCfi || initialMarker.marker?.cfi || "",
          markerEndOffset: state.markerEndOffset >= 0 ? state.markerEndOffset : initialMarker.marker?.sourceEnd ?? -1,
          markerIndex: state.markerIndex >= 0 ? state.markerIndex : initialMarker.markerIndex,
          markerLocatorText:
            state.markerLocatorText || initialMarker.marker?.locatorText || initialMarker.marker?.text || chunk.text,
          markerStartOffset: state.markerStartOffset >= 0 ? state.markerStartOffset : initialMarker.marker?.sourceStart ?? -1,
          markerText: state.markerText || initialMarker.markerText,
          status: "error",
        });
      }
      return;
    }
  }

  return {
    getState() {
      return state;
    },
    pause() {
      if (state.status !== "playing") {
        return;
      }

      client.pause();
      emitState({
        ...state,
        status: "paused",
      });
    },
    async resume() {
      if (state.status !== "paused") {
        return;
      }

      client.resume();
      emitState({
        ...state,
        status: "playing",
      });
    },
    async start({ chunks, request }: StartArgs) {
      runId += 1;
      const activeRunId = runId;

      if (!chunks.length) {
        emitState({
          chunkIndex: -1,
          currentText: "",
          markerCfi: "",
          markerEndOffset: -1,
          markerIndex: -1,
          markerLocatorText: "",
          markerStartOffset: -1,
          markerText: "",
          status: "idle",
        });
        return;
      }

      await speakChunk(chunks.map(normalizeChunk), 0, request, activeRunId);
    },
    stop() {
      runId += 1;
      client.stop();
      emitState({
        chunkIndex: -1,
        currentText: "",
        markerCfi: "",
        markerEndOffset: -1,
        markerIndex: -1,
        markerLocatorText: "",
        markerStartOffset: -1,
        markerText: "",
        status: "idle",
      });
    },
  };
}
