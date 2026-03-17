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

type AudioTask = {
  chunk: string;
  promise: Promise<Blob>;
  settled: boolean;
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

  function createAudioTask(chunk: string, request: Omit<LocalTtsSpeakRequest, "text">): AudioTask {
    const task: AudioTask = {
      chunk,
      promise: Promise.resolve(new Blob()),
      settled: false,
    };

    task.promise = speak({
      ...request,
      text: chunk,
    }).then(
      (audio) => {
        task.settled = true;
        return audio;
      },
      (error) => {
        task.settled = true;
        throw error;
      },
    );

    return task;
  }

  async function start({ chunks, request }: StartArgs) {
    runId += 1;
    const activeRunId = runId;

    if (!chunks.length) {
      emitState({ currentText: "", status: "idle" });
      return;
    }

    let currentTask: AudioTask | null = createAudioTask(chunks[0], request);

    for (const [index, chunk] of chunks.entries()) {
      if (activeRunId !== runId) {
        break;
      }

      if (!currentTask) {
        break;
      }

      if (index === 0 || !currentTask.settled) {
        emitState({
          currentText: chunk,
          status: "loading",
        });
      }

      let audio: Blob;
      try {
        audio = await currentTask.promise;
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

      const nextChunk = chunks[index + 1];
      const nextTask = nextChunk ? createAudioTask(nextChunk, request) : null;

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

      currentTask = nextTask;
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
