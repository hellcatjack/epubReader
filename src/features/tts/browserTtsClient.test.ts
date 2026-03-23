import { describe, expect, it, vi } from "vitest";
import { createBrowserTtsClient } from "./browserTtsClient";

function buildVoice(name: string, lang = "en-US", defaultValue = false): SpeechSynthesisVoice {
  return {
    default: defaultValue,
    lang,
    localService: true,
    name,
    voiceURI: name,
  };
}

describe("browserTtsClient", () => {
  it("loads voices and ranks English natural voices first", async () => {
    const voices = [
      buildVoice("Google UK English"),
      buildVoice("Microsoft Ava Online (Natural)"),
      buildVoice("Microsoft Andrew Online (Natural)"),
      buildVoice("Microsoft Huihui", "zh-CN"),
    ];
    const speak = vi.fn();
    const cancel = vi.fn();
    const pause = vi.fn();
    const resume = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    const client = createBrowserTtsClient({
      speechSynthesis: {
        addEventListener,
        cancel,
        getVoices: () => voices,
        pause,
        pending: false,
        removeEventListener,
        resume,
        speak,
        speaking: false,
      } as unknown as SpeechSynthesis,
      utteranceFactory: (text) => ({ text }) as SpeechSynthesisUtterance,
    });

    await expect(client.getVoices()).resolves.toEqual([
      expect.objectContaining({ id: "Microsoft Ava Online (Natural)" }),
      expect.objectContaining({ id: "Microsoft Andrew Online (Natural)" }),
      expect.objectContaining({ id: "Google UK English" }),
    ]);
  });

  it("throws when speechSynthesis is unavailable", async () => {
    const client = createBrowserTtsClient({
      speechSynthesis: undefined,
      utteranceFactory: (text) => ({ text }) as SpeechSynthesisUtterance,
    });

    await expect(client.getVoices()).rejects.toThrow("speechSynthesis unavailable");
  });

  it("starts a selection utterance with the chosen voice, rate, and volume", async () => {
    const voices = [buildVoice("Microsoft Ava Online (Natural)", "en-US", true)];
    const speak = vi.fn();

    const client = createBrowserTtsClient({
      speechSynthesis: {
        addEventListener: vi.fn(),
        cancel: vi.fn(),
        getVoices: () => voices,
        pause: vi.fn(),
        pending: false,
        removeEventListener: vi.fn(),
        resume: vi.fn(),
        speak,
        speaking: false,
      } as unknown as SpeechSynthesis,
      utteranceFactory: (text) => ({ text }) as SpeechSynthesisUtterance,
    });

    await client.speakSelection("Hello reader", {
      onEnd: vi.fn(),
      onError: vi.fn(),
      rate: 1,
      voiceId: "Microsoft Ava Online (Natural)",
      volume: 1,
    });

    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0]?.[0]).toMatchObject({
      text: "Hello reader",
      rate: 1,
      volume: 1,
      voice: expect.objectContaining({
        name: "Microsoft Ava Online (Natural)",
      }),
    });
  });

  it("forwards utterance start events to the caller", async () => {
    const voices = [buildVoice("Microsoft Ava Online (Natural)", "en-US", true)];
    let utterance:
      | (SpeechSynthesisUtterance & {
          onstart?: (() => void) | null;
        })
      | undefined;
    const onStart = vi.fn();

    const client = createBrowserTtsClient({
      speechSynthesis: {
        addEventListener: vi.fn(),
        cancel: vi.fn(),
        getVoices: () => voices,
        pause: vi.fn(),
        pending: false,
        removeEventListener: vi.fn(),
        resume: vi.fn(),
        speak: vi.fn((nextUtterance: SpeechSynthesisUtterance) => {
          utterance = nextUtterance as SpeechSynthesisUtterance & {
            onstart?: (() => void) | null;
          };
        }),
        speaking: false,
      } as unknown as SpeechSynthesis,
      utteranceFactory: (text) => ({ text }) as SpeechSynthesisUtterance,
    });

    await client.speakSelection("Hello reader", {
      onEnd: vi.fn(),
      onError: vi.fn(),
      onStart,
      rate: 1,
      voiceId: "Microsoft Ava Online (Natural)",
      volume: 1,
    });

    utterance?.onstart?.();
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
