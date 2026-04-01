import { afterEach, describe, expect, it, vi } from "vitest";
import { createTtsQueue } from "./ttsQueue";

function createFakeBrowserTtsClient() {
  let current:
    | {
        onStart?: () => void;
        onBoundary?: (event: SpeechSynthesisEvent) => void;
        onEnd?: () => void;
        onError?: (error: Event | SpeechSynthesisErrorEvent) => void;
        text: string;
      }
    | undefined;

  return {
    emitStart() {
      current?.onStart?.();
    },
    emitBoundary(charIndex: number) {
      current?.onBoundary?.({ charIndex } as SpeechSynthesisEvent);
    },
    emitBoundaryEvent(event: Partial<SpeechSynthesisEvent>) {
      current?.onBoundary?.(event as SpeechSynthesisEvent);
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
          onStart?: () => void;
          onBoundary?: (event: SpeechSynthesisEvent) => void;
          onEnd?: () => void;
          onError?: (error: Event | SpeechSynthesisErrorEvent) => void;
          rate: number;
          voiceId: string;
          volume: number;
        },
      ) => {
        current = {
          onStart: options.onStart,
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
  afterEach(() => {
    vi.useRealTimers();
  });

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
    client.emitStart();
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

  it("waits for a chunk-specific pause before advancing to the next queued segment", async () => {
    vi.useFakeTimers();
    const client = createFakeBrowserTtsClient();
    const queue = createTtsQueue({
      client,
    });

    await queue.start({
      chunks: [
        {
          markers: [{ end: "Nations Descended from Noah.".length, start: 0, text: "Nations Descended from Noah." }],
          pauseAfterMs: 350,
          text: "Nations Descended from Noah.",
        },
        "These are the generations of the sons of Noah.",
      ],
      request: {
        rate: 1,
        voiceId: "en-US-Natural-A",
        volume: 1,
      },
    });

    expect(client.speakSelection).toHaveBeenNthCalledWith(
      1,
      "Nations Descended from Noah.",
      expect.objectContaining({
        rate: 1,
        voiceId: "en-US-Natural-A",
        volume: 1,
      }),
    );

    client.finishCurrent();
    vi.advanceTimersByTime(349);

    expect(client.speakSelection).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);

    await vi.waitFor(() => {
      expect(client.speakSelection).toHaveBeenNthCalledWith(
        2,
        "These are the generations of the sons of Noah.",
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

    client.emitStart();
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
    const expectedWord = "spoken";
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
      markerText: expectedWord,
      status: "playing",
    });
  });

  it("tracks the currently spoken word inside a single marker from speech boundaries", async () => {
    const client = createFakeBrowserTtsClient();
    const queue = createTtsQueue({
      client,
    });
    const chunk = "The highlight should follow the spoken word instead of the full sentence.";

    await queue.start({
      chunks: [
        {
          markers: [
            {
              cfi: "epubcfi(/6/2!/4/2/1:0)",
              end: chunk.length,
              start: 0,
              text: chunk,
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

    client.emitStart();
    client.emitBoundary(chunk.indexOf("spoken"));

    expect(queue.getState()).toMatchObject({
      currentText: chunk,
      markerCfi: "epubcfi(/6/2!/4/2/1:0)",
      markerText: "spoken",
      status: "playing",
    });
  });

  it("ignores sentence boundary events so the active highlight stays on the current spoken word", async () => {
    const client = createFakeBrowserTtsClient();
    const queue = createTtsQueue({
      client,
    });
    const chunk = "The reader keeps listening until the sentence ends.";

    await queue.start({
      chunks: [
        {
          markers: [
            {
              cfi: "epubcfi(/6/2!/4/2/1:0)",
              end: chunk.length,
              start: 0,
              text: chunk,
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

    client.emitStart();

    expect(queue.getState()).toMatchObject({
      markerText: "The",
      status: "playing",
    });

    client.emitBoundaryEvent({
      charIndex: chunk.length - 1,
      name: "sentence",
    });

    expect(queue.getState()).toMatchObject({
      markerText: "The",
      status: "playing",
    });
  });

  it("waits for the first spoken boundary before exposing the first marker highlight when a chunk spans multiple targets", async () => {
    const client = createFakeBrowserTtsClient();
    const queue = createTtsQueue({
      client,
    });

    await queue.start({
      chunks: [
        {
          markers: [
            {
              cfi: "epubcfi(/6/2!/4/2/1:0)",
              end: "First paragraph.".length,
              start: 0,
              text: "First paragraph.",
            },
            {
              cfi: "epubcfi(/6/2!/4/4/1:0)",
              end: "First paragraph. Second paragraph.".length,
              start: "First paragraph. ".length,
              text: "Second paragraph.",
            },
          ],
          text: "First paragraph. Second paragraph.",
        },
      ],
      request: {
        rate: 1,
        voiceId: "en-US-Natural-A",
        volume: 1,
      },
    });

    expect(queue.getState()).toMatchObject({
      currentText: "First paragraph. Second paragraph.",
      markerCfi: "",
      markerText: "",
      status: "loading",
    });

    client.emitStart();

    expect(queue.getState()).toMatchObject({
      currentText: "First paragraph. Second paragraph.",
      status: "playing",
    });
    expect(queue.getState()).toMatchObject({
      markerCfi: "",
      markerText: "",
    });

    client.emitBoundary(0);

    expect(queue.getState()).toMatchObject({
      currentText: "First paragraph. Second paragraph.",
      markerCfi: "epubcfi(/6/2!/4/2/1:0)",
      markerText: "First",
      status: "playing",
    });
  });

  it("falls back to the first marker shortly after start when the browser never emits boundaries", async () => {
    vi.useFakeTimers();
    const client = createFakeBrowserTtsClient();
    const queue = createTtsQueue({
      client,
    });

    await queue.start({
      chunks: [
        {
          markers: [
            {
              cfi: "epubcfi(/6/2!/4/2/1:0)",
              end: "First paragraph.".length,
              start: 0,
              text: "First paragraph.",
            },
            {
              cfi: "epubcfi(/6/2!/4/4/1:0)",
              end: "First paragraph. Second paragraph.".length,
              start: "First paragraph. ".length,
              text: "Second paragraph.",
            },
          ],
          text: "First paragraph. Second paragraph.",
        },
      ],
      request: {
        rate: 1,
        voiceId: "en-US-Natural-A",
        volume: 1,
      },
    });

    client.emitStart();
    vi.advanceTimersByTime(249);
    expect(queue.getState()).toMatchObject({
      markerCfi: "",
      markerText: "",
      status: "playing",
    });

    vi.advanceTimersByTime(1);

    expect(queue.getState()).toMatchObject({
      markerCfi: "epubcfi(/6/2!/4/2/1:0)",
      markerText: "First",
      status: "playing",
    });
  });

  it("respects a custom initial marker fallback duration", async () => {
    vi.useFakeTimers();
    const client = createFakeBrowserTtsClient();
    const queue = createTtsQueue({
      client,
    });

    await queue.start({
      chunks: [
        {
          markers: [
            {
              cfi: "epubcfi(/6/2!/4/2/1:0)",
              end: "First paragraph.".length,
              start: 0,
              text: "First paragraph.",
            },
            {
              cfi: "epubcfi(/6/2!/4/4/1:0)",
              end: "First paragraph. Second paragraph.".length,
              start: "First paragraph. ".length,
              text: "Second paragraph.",
            },
          ],
          text: "First paragraph. Second paragraph.",
        },
      ],
      request: {
        initialMarkerFallbackMs: 700,
        rate: 1,
        voiceId: "en-US-Natural-A",
        volume: 1,
      },
    });

    client.emitStart();
    vi.advanceTimersByTime(699);
    expect(queue.getState()).toMatchObject({
      markerCfi: "",
      markerText: "",
      status: "playing",
    });

    vi.advanceTimersByTime(1);
    expect(queue.getState()).toMatchObject({
      markerCfi: "epubcfi(/6/2!/4/2/1:0)",
      markerText: "First",
      status: "playing",
    });
  });

  it("reveals the first marker on start when a chunk maps to a single highlight target", async () => {
    const client = createFakeBrowserTtsClient();
    const queue = createTtsQueue({
      client,
    });

    await queue.start({
      chunks: [
        {
          markers: [
            {
              cfi: "epubcfi(/6/2!/4/2/1:0)",
              end: "First sentence.".length,
              start: 0,
              text: "First sentence.",
            },
            {
              cfi: "epubcfi(/6/2!/4/2/1:0)",
              end: "First sentence. Second sentence.".length,
              start: "First sentence. ".length,
              text: "Second sentence.",
            },
          ],
          text: "First sentence. Second sentence.",
        },
      ],
      request: {
        initialMarkerFallbackMs: 700,
        rate: 1,
        voiceId: "en-US-Natural-A",
        volume: 1,
      },
    });

    client.emitStart();

    expect(queue.getState()).toMatchObject({
      markerCfi: "epubcfi(/6/2!/4/2/1:0)",
      markerText: "First",
      status: "playing",
    });
  });

  it("does not emit block-local offsets for plain text chunks that have no source coordinates", async () => {
    const client = createFakeBrowserTtsClient();
    const queue = createTtsQueue({
      client,
    });
    const chunk = "First paragraph. Second paragraph keeps speaking.";

    await queue.start({
      chunks: [chunk],
      request: {
        rate: 1,
        voiceId: "en-US-Natural-A",
        volume: 1,
      },
    });

    client.emitStart();
    client.emitBoundary(chunk.indexOf("speaking"));

    expect(queue.getState()).toMatchObject({
      markerEndOffset: -1,
      markerStartOffset: -1,
      markerText: "speaking",
      status: "playing",
    });
  });
});
