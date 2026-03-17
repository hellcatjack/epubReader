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
  currentText: string;
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
    currentText: "",
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

  const buildMarkerText = (chunk: TtsQueueChunk, charIndex = 0) => {
    const normalizedIndex = Math.max(0, Math.min(charIndex, chunk.text.length));
    const marker =
      chunk.markers.find((candidate) => normalizedIndex >= candidate.start && normalizedIndex <= candidate.end) ??
      chunk.markers.at(-1);

    return marker?.text || chunk.text;
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
        currentText: "",
        markerText: "",
        status: "idle",
      });
      return;
    }

    emitState({
      currentText: chunk.text,
      markerText: buildMarkerText(chunk),
      status: index === 0 ? "loading" : "playing",
    });

    try {
      await client.speakSelection(chunk.text, {
        ...request,
        onBoundary: (event) => {
          if (activeRunId !== runId) {
            return;
          }

          emitState({
            ...state,
            currentText: chunk.text,
            markerText: buildMarkerText(chunk, event.charIndex),
          });
        },
        onEnd: () => {
          void speakChunk(chunks, index + 1, request, activeRunId);
        },
        onError: () => {
          if (activeRunId === runId) {
            emitState({
              currentText: chunk.text,
              markerText: state.markerText || buildMarkerText(chunk),
              status: "error",
            });
          }
        },
      });
    } catch {
      if (activeRunId === runId) {
        emitState({
          currentText: chunk.text,
          markerText: state.markerText || buildMarkerText(chunk),
          status: "error",
        });
      }
      return;
    }

    if (activeRunId === runId) {
      emitState({
        currentText: chunk.text,
        markerText: state.markerText || buildMarkerText(chunk),
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
          currentText: "",
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
        currentText: "",
        markerText: "",
        status: "idle",
      });
    },
  };
}
