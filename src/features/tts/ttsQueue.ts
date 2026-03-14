import type { LocalTtsSpeakRequest } from "./localTtsClient";

type TtsQueuePlayer = {
  load(blob: Blob): Promise<unknown>;
  pause(): void;
  playUntilEnded(): Promise<void>;
  resume(): Promise<unknown>;
  stop(): void;
};

type TtsQueueDeps = {
  onStateChange?: (state: TtsQueueState) => void;
  player: TtsQueuePlayer;
  speak: (request: LocalTtsSpeakRequest & { text: string }) => Promise<Blob>;
};

export type TtsQueueState = {
  currentText: string;
  status: "idle" | "loading" | "playing" | "paused" | "error";
};

type StartArgs = {
  chunks: string[];
  request: Omit<LocalTtsSpeakRequest, "text">;
};

export function createTtsQueue({ onStateChange, player, speak }: TtsQueueDeps) {
  let state: TtsQueueState = {
    currentText: "",
    status: "idle",
  };
  let runId = 0;
  const emitState = (nextState: TtsQueueState) => {
    state = nextState;
    onStateChange?.(nextState);
  };

  async function start({ chunks, request }: StartArgs) {
    runId += 1;
    const activeRunId = runId;

    if (!chunks.length) {
      emitState({ currentText: "", status: "idle" });
      return;
    }

    for (const chunk of chunks) {
      if (activeRunId !== runId) {
        break;
      }

      emitState({
        currentText: chunk,
        status: "loading",
      });

      let audio: Blob;
      try {
        audio = await speak({
          ...request,
          text: chunk,
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

      if (activeRunId !== runId) {
        break;
      }

      await player.load(audio);
      emitState({
        currentText: chunk,
        status: "playing",
      });

      try {
        await player.playUntilEnded();
      } catch {
        if (activeRunId === runId) {
          emitState({
            currentText: chunk,
            status: "error",
          });
        }
        return;
      }
    }

    if (activeRunId === runId) {
      emitState({
        currentText: "",
        status: "idle",
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

      player.pause();
      emitState({
        ...state,
        status: "paused",
      });
    },
    async resume() {
      if (state.status !== "paused") {
        return;
      }

      await player.resume();
      emitState({
        ...state,
        status: "playing",
      });
    },
    start,
    stop() {
      runId += 1;
      player.stop();
      emitState({
        currentText: "",
        status: "idle",
      });
    },
  };
}
