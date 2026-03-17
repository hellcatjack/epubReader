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
  status: "idle" | "warming_up" | "loading" | "playing" | "paused" | "error";
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
    let nextTask: AudioTask | null = chunks[1] ? createAudioTask(chunks[1], request) : null;

    emitState({
      currentText: chunks[0] ?? "",
      status: "warming_up",
    });

    for (const [index, chunk] of chunks.entries()) {
      if (activeRunId !== runId) {
        break;
      }

      if (!currentTask) {
        break;
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

      await player.load(audio);
      emitState({
        currentText: chunk,
        status: "playing",
      });

      const futureChunk = chunks[index + 2];
      const futureTask = futureChunk ? createAudioTask(futureChunk, request) : null;

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
      nextTask = futureTask;

      if (currentTask && activeRunId === runId) {
        emitState({
          currentText: currentTask.chunk,
          status: currentTask.settled ? "playing" : "loading",
        });
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
