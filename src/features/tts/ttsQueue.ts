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
  markerIndex: number;
  markerText: string;
  status: "idle" | "loading" | "playing" | "paused" | "error";
};

type StartArgs = {
  chunks: Array<ChunkSegment | string>;
  request: Omit<BrowserTtsSpeakOptions, "onEnd" | "onError">;
};

export type TtsQueueChunk = ChunkSegment;

export function createTtsQueue({ client, onStateChange }: TtsQueueDeps) {
  let state: TtsQueueState = {
    chunkIndex: -1,
    currentText: "",
    markerCfi: "",
    markerIndex: -1,
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

  const emitState = (nextState: TtsQueueState) => {
    state = nextState;
    onStateChange?.(nextState);
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
        markerIndex: -1,
        markerText: "",
        status: "idle",
      });
      return;
    }

    const initialMarker = resolveMarker(chunk);

    emitState({
      chunkIndex: index,
      currentText: chunk.text,
      markerCfi: initialMarker.marker?.cfi ?? "",
      markerIndex: initialMarker.markerIndex,
      markerText: initialMarker.markerText,
      status: index === 0 ? "loading" : "playing",
    });

    try {
      await client.speakSelection(chunk.text, {
        ...request,
        onBoundary: (event) => {
          if (activeRunId !== runId) {
            return;
          }

          const nextMarker = resolveMarker(chunk, event.charIndex);

          emitState({
            ...state,
            chunkIndex: index,
            currentText: chunk.text,
            markerCfi: nextMarker.marker?.cfi ?? "",
            markerIndex: nextMarker.markerIndex,
            markerText: nextMarker.markerText,
          });
        },
        onEnd: () => {
          void speakChunk(chunks, index + 1, request, activeRunId);
        },
        onError: () => {
          if (activeRunId === runId) {
            emitState({
              chunkIndex: index,
              currentText: chunk.text,
              markerCfi: state.markerCfi || initialMarker.marker?.cfi || "",
              markerIndex: state.markerIndex >= 0 ? state.markerIndex : initialMarker.markerIndex,
              markerText: state.markerText || initialMarker.markerText,
              status: "error",
            });
          }
        },
      });
    } catch {
      if (activeRunId === runId) {
        emitState({
          chunkIndex: index,
          currentText: chunk.text,
          markerCfi: state.markerCfi || initialMarker.marker?.cfi || "",
          markerIndex: state.markerIndex >= 0 ? state.markerIndex : initialMarker.markerIndex,
          markerText: state.markerText || initialMarker.markerText,
          status: "error",
        });
      }
      return;
    }

    if (activeRunId === runId) {
      emitState({
        chunkIndex: index,
        currentText: chunk.text,
        markerCfi: state.markerCfi || initialMarker.marker?.cfi || "",
        markerIndex: state.markerIndex >= 0 ? state.markerIndex : initialMarker.markerIndex,
        markerText: state.markerText || initialMarker.markerText,
        status: "playing",
      });
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
          markerIndex: -1,
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
        markerIndex: -1,
        markerText: "",
        status: "idle",
      });
    },
  };
}
