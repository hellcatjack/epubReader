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
});
