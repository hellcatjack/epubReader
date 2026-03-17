import { describe, expect, it, vi } from "vitest";
import { createTtsQueue } from "./ttsQueue";

function createFakeBrowserTtsClient() {
  let current:
    | {
        onEnd?: () => void;
        onError?: (error: Error) => void;
        text: string;
      }
    | undefined;

  return {
    finishCurrent() {
      current?.onEnd?.();
    },
    failCurrent(error = new Error("synthesis failed")) {
      current?.onError?.(error);
    },
    pause: vi.fn(),
    resume: vi.fn(),
    speakSelection: vi.fn(
      async (
        text: string,
        options: {
          onEnd?: () => void;
          onError?: (error: Error) => void;
          rate: number;
          voiceId: string;
          volume: number;
        },
      ) => {
        current = {
          onEnd: options.onEnd,
          onError: options.onError,
          text,
        };
      },
    ),
    stop: vi.fn(),
  };
}

describe("ttsQueue", () => {
  it("advances to the next queued segment after the current utterance ends", async () => {
    const client = createFakeBrowserTtsClient();
    const queue = createTtsQueue({
      client,
    });

    await queue.start({
      chunks: ["First paragraph.", "Second paragraph."],
      request: {
        rate: 1,
        voiceId: "en-US-Natural-A",
        volume: 1,
      },
    });

    expect(client.speakSelection).toHaveBeenCalledWith(
      "First paragraph.",
      expect.objectContaining({
        rate: 1,
        voiceId: "en-US-Natural-A",
        volume: 1,
      }),
    );
    expect(queue.getState()).toMatchObject({
      currentText: "First paragraph.",
      status: "playing",
    });

    client.finishCurrent();

    await vi.waitFor(() => {
      expect(client.speakSelection).toHaveBeenCalledWith(
        "Second paragraph.",
        expect.objectContaining({
          rate: 1,
          voiceId: "en-US-Natural-A",
          volume: 1,
        }),
      );
    });
  });

  it("stops the queue on utterance error", async () => {
    const client = createFakeBrowserTtsClient();
    const queue = createTtsQueue({
      client,
    });

    await queue.start({
      chunks: ["First paragraph."],
      request: {
        rate: 1,
        voiceId: "en-US-Natural-A",
        volume: 1,
      },
    });

    client.failCurrent(new Error("synthesis failed"));

    await vi.waitFor(() => {
      expect(queue.getState()).toMatchObject({
        currentText: "First paragraph.",
        status: "error",
      });
    });
  });

  it("supports pause resume and stop with the browser client", async () => {
    const client = createFakeBrowserTtsClient();
    const queue = createTtsQueue({
      client,
    });

    await queue.start({
      chunks: ["First paragraph."],
      request: {
        rate: 1,
        voiceId: "en-US-Natural-A",
        volume: 1,
      },
    });

    queue.pause();
    expect(client.pause).toHaveBeenCalledTimes(1);
    expect(queue.getState().status).toBe("paused");

    await queue.resume();
    expect(client.resume).toHaveBeenCalledTimes(1);
    expect(queue.getState().status).toBe("playing");

    queue.stop();
    expect(client.stop).toHaveBeenCalledTimes(1);
    expect(queue.getState()).toMatchObject({
      currentText: "",
      status: "idle",
    });
  });
});
