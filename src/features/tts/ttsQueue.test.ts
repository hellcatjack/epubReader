import { describe, expect, it, vi } from "vitest";
import { createTtsQueue } from "./ttsQueue";

describe("ttsQueue", () => {
  it("plays chunks sequentially and supports pause resume and stop", async () => {
    const speak = vi.fn(async ({ text }: { text: string }) => new Blob([text], { type: "audio/wav" }));
    const playResolvers: Array<() => void> = [];
    const player = {
      load: vi.fn(async () => undefined),
      pause: vi.fn(),
      playUntilEnded: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            playResolvers.push(resolve);
          }),
      ),
      resume: vi.fn(async () => undefined),
      stop: vi.fn(),
    };

    const queue = createTtsQueue({
      player,
      speak,
    });

    const run = queue.start({
      chunks: ["First chunk.", "Second chunk."],
      request: {
        format: "wav",
        rate: 1,
        voiceId: "voice-1",
        volume: 1,
      },
    });

    await vi.waitFor(() => {
      expect(queue.getState()).toMatchObject({
        currentText: "First chunk.",
        status: "playing",
      });
    });

    queue.pause();
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(queue.getState().status).toBe("paused");

    await queue.resume();
    expect(player.resume).toHaveBeenCalledTimes(1);
    expect(queue.getState().status).toBe("playing");

    playResolvers.shift()?.();

    await vi.waitFor(() => {
      expect(speak).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Second chunk.",
        }),
      );
    });

    queue.stop();
    expect(player.stop).toHaveBeenCalledTimes(1);

    playResolvers.shift()?.();
    await run;

    expect(queue.getState()).toMatchObject({
      currentText: "",
      status: "idle",
    });
  });

  it("prefetches the next chunk while the current chunk is playing", async () => {
    let resolveFirstAudio: ((blob: Blob) => void) | undefined;
    let resolveSecondAudio: ((blob: Blob) => void) | undefined;
    const playResolvers: Array<() => void> = [];
    const speak = vi.fn(({ text }: { text: string }) => {
      return new Promise<Blob>((resolve) => {
        if (text === "First chunk.") {
          resolveFirstAudio = resolve;
          return;
        }

        resolveSecondAudio = resolve;
      });
    });
    const player = {
      load: vi.fn(async () => undefined),
      pause: vi.fn(),
      playUntilEnded: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            playResolvers.push(resolve);
          }),
      ),
      resume: vi.fn(async () => undefined),
      stop: vi.fn(),
    };

    const queue = createTtsQueue({
      player,
      speak,
    });

    const run = queue.start({
      chunks: ["First chunk.", "Second chunk."],
      request: {
        format: "wav",
        rate: 1,
        voiceId: "voice-1",
        volume: 1,
      },
    });

    await vi.waitFor(() => {
      expect(speak).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          text: "First chunk.",
        }),
      );
    });

    resolveFirstAudio?.(new Blob(["first"], { type: "audio/wav" }));

    await vi.waitFor(() => {
      expect(queue.getState()).toMatchObject({
        currentText: "First chunk.",
        status: "playing",
      });
    });

    expect(speak).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        text: "Second chunk.",
      }),
    );

    resolveSecondAudio?.(new Blob(["second"], { type: "audio/wav" }));
    playResolvers.shift()?.();

    await vi.waitFor(() => {
      expect(playResolvers.length).toBeGreaterThan(0);
    });

    playResolvers.shift()?.();

    await run;
  });
});
