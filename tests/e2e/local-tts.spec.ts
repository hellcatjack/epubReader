import { expect, test } from "@playwright/test";
import { selectTextInIframe } from "./helpers/epubSelection";

const fixturePath = "tests/fixtures/epub/minimal-valid.epub";

test("browser tts supports selection playback and continuous reader controls", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string; voice: string | null }> = [];
    let paused = false;
    let activeTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

    class MockSpeechSynthesisUtterance {
      onend: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      rate = 1;
      text: string;
      voice: SpeechSynthesisVoice | null = null;
      volume = 1;

      constructor(text: string) {
        this.text = text;
      }
    }

    const voices = [
      {
        default: true,
        lang: "en-US",
        localService: false,
        name: "Microsoft Ava Online (Natural)",
        voiceURI: "Microsoft Ava Online (Natural)",
      },
    ];

    const speechSynthesis = {
      addEventListener() {
        return undefined;
      },
      cancel() {
        paused = false;
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = undefined;
        }
      },
      getVoices() {
        return voices;
      },
      pause() {
        paused = true;
      },
      pending: false,
      removeEventListener() {
        return undefined;
      },
      resume() {
        paused = false;
      },
      speak(utterance: MockSpeechSynthesisUtterance) {
        calls.push({ text: utterance.text, voice: utterance.voice?.name ?? null });
        activeTimer = window.setTimeout(() => {
          if (!paused) {
            utterance.onend?.(new Event("end"));
          }
        }, 100);
      },
      speaking: false,
    };

    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: speechSynthesis,
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: MockSpeechSynthesisUtterance,
    });
    Object.defineProperty(window, "__ttsCalls", {
      configurable: true,
      value: calls,
      writable: false,
    });
  });

  await page.route("http://192.168.1.31:8001/v1/chat/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content: "中文翻译" } }],
      }),
    });
  });

  await page.goto("/");
  await page.setInputFiles("input[type=file]", fixturePath);
  await expect(page).toHaveURL(/\/books\//);

  const selectedText = await selectTextInIframe(page);
  expect(selectedText.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: /read aloud/i }).click();
  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBe(1);

  const firstCall = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: Array<{ text: string; voice: string | null }> }).__ttsCalls[0],
  );
  expect(firstCall?.text).toContain(selectedText);
  expect(firstCall?.voice).toBe("Microsoft Ava Online (Natural)");

  await page.getByRole("button", { name: /start tts/i }).click();
  await expect(page.getByText(/tts status: playing/i)).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBeGreaterThan(1);

  await page.getByRole("button", { name: /pause tts/i }).click();
  await expect(page.getByText(/tts status: paused/i)).toBeVisible();

  await page.getByRole("button", { name: /resume tts/i }).click();
  await expect(page.getByText(/tts status: playing/i)).toBeVisible();

  await page.getByRole("button", { name: /stop tts/i }).click();
  await expect(page.getByText(/tts status: idle/i)).toBeVisible();
});
