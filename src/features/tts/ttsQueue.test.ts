import { describe, expect, it, vi } from "vitest";
import { createTtsQueue } from "./ttsQueue";

function createFakeBrowserTtsClient() {
  let current:
    | {
        onBoundary?: (event: SpeechSynthesisEvent) => void;
        onEnd?: () => void;
        onError?: (error: Event | SpeechSynthesisErrorEvent) => void;
        text: string;
      }
    | undefined;

  return {
    emitBoundary(charIndex: number) {
      current?.onBoundary?.({ charIndex } as SpeechSynthesisEvent);
    },
    finishCurrent() {
      current?.onEnd?.();
    },
    failCurrent(error: Event | SpeechSynthesisErrorEvent = new Event("error")) {
      current?.onError?.(error);
    },
    pause: vi.fn(),
    resume: vi.fn(),
    speakSelection: vi.fn(
      async (
        text: string,
        options: {
          onBoundary?: (event: SpeechSynthesisEvent) => void;
          onEnd?: () => void;
          onError?: (error: Event | SpeechSynthesisErrorEvent) => void;
          rate: number;
          voiceId: string;
          volume: number;
        },
      ) => {
        current = {
          onBoundary: options.onBoundary,
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

    client.failCurrent(new Event("error"));

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
      markerText: "",
      status: "idle",
    });
  });

  it("updates marker text from boundary progress inside the active chunk", async () => {
    const client = createFakeBrowserTtsClient();
    const queue = createTtsQueue({
      client,
    });
    const chunk =
      "First paragraph keeps the opening marker. Second paragraph should move the marker when the spoken boundary reaches it.";
    const expectedParagraph = "Second paragraph should move the marker when the spoken boundary reaches it.";

    await queue.start({
      chunks: [
        {
          markers: [
            {
              end: "First paragraph keeps the opening marker.".length,
              start: 0,
              text: "First paragraph keeps the opening marker.",
            },
            {
              end: chunk.length,
              start: "First paragraph keeps the opening marker. ".length,
              text: expectedParagraph,
            },
          ],
          text: chunk,
        },
      ],
      request: {
        rate: 1,
        voiceId: "en-US-Natural-A",
        volume: 1,
      },
    });

    client.emitBoundary(chunk.indexOf("spoken boundary"));

    expect(queue.getState()).toMatchObject({
      currentText: chunk,
      markerText: expectedParagraph,
      status: "playing",
    });
  });
});
