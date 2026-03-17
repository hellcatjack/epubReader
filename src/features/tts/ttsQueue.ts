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
  status: "idle" | "loading" | "playing" | "paused" | "error";
};

type StartArgs = {
  chunks: string[];
  request: Omit<BrowserTtsSpeakOptions, "onEnd" | "onError">;
};

export function createTtsQueue({ client, onStateChange }: TtsQueueDeps) {
  let state: TtsQueueState = {
    currentText: "",
    status: "idle",
  };
  let runId = 0;

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
        status: "idle",
      });
      return;
    }

    emitState({
      currentText: chunk,
      status: index === 0 ? "loading" : "playing",
    });

    try {
      await client.speakSelection(chunk, {
        ...request,
        onEnd: () => {
          void speakChunk(chunks, index + 1, request, activeRunId);
        },
        onError: () => {
          if (activeRunId === runId) {
            emitState({
              currentText: chunk,
              status: "error",
            });
          }
        },
      });
    } catch {
      if (activeRunId === runId) {
        emitState({
          currentText: chunk,
          status: "error",
        });
      }
      return;
    }

    if (activeRunId === runId) {
      emitState({
        currentText: chunk,
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
        status: "idle",
      });
    },
  };
}
