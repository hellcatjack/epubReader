import type { BrowserTtsSpeakOptions } from "./browserTtsClient";

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
  chunks: string[];
  request: Omit<BrowserTtsSpeakOptions, "onEnd" | "onError">;
};

export function createTtsQueue({ client, onStateChange }: TtsQueueDeps) {
  let state: TtsQueueState = {
    currentText: "",
    markerText: "",
    status: "idle",
  };
  let runId = 0;

  const buildMarkerText = (chunk: string, charIndex = 0) => {
    let start = Math.max(0, Math.min(charIndex, chunk.length));

    while (start > 0 && /\S/.test(chunk[start - 1] ?? "") && /\S/.test(chunk[start] ?? "")) {
      start -= 1;
    }

    return chunk.slice(start).trimStart().slice(0, 180) || chunk.slice(0, 180);
  };

  const emitState = (nextState: TtsQueueState) => {
    state = nextState;
    onStateChange?.(nextState);
  };

  async function speakChunk(chunks: string[], index: number, request: StartArgs["request"], activeRunId: number) {
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
      currentText: chunk,
      markerText: buildMarkerText(chunk),
      status: index === 0 ? "loading" : "playing",
    });

    try {
      await client.speakSelection(chunk, {
        ...request,
        onBoundary: (event) => {
          if (activeRunId !== runId) {
            return;
          }

          emitState({
            ...state,
            currentText: chunk,
            markerText: buildMarkerText(chunk, event.charIndex),
          });
        },
        onEnd: () => {
          void speakChunk(chunks, index + 1, request, activeRunId);
        },
        onError: () => {
          if (activeRunId === runId) {
            emitState({
              currentText: chunk,
              markerText: state.markerText || buildMarkerText(chunk),
              status: "error",
            });
          }
        },
      });
    } catch {
      if (activeRunId === runId) {
        emitState({
          currentText: chunk,
          markerText: state.markerText || buildMarkerText(chunk),
          status: "error",
        });
      }
      return;
    }

    if (activeRunId === runId) {
      emitState({
        currentText: chunk,
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

      await speakChunk(chunks, 0, request, activeRunId);
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
