import { expect, test } from "@playwright/test";
import { selectTextInIframe } from "./helpers/epubSelection";

const fixturePath = "tests/fixtures/epub/minimal-valid.epub";

test("browser tts supports selection playback and continuous reader controls", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ rate: number; text: string; voice: string | null; volume: number }> = [];
    let paused = false;
    let activeTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

    class MockSpeechSynthesisUtterance {
      onboundary: ((event: Event & { charIndex: number }) => void) | null = null;
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
      {
        default: false,
        lang: "en-US",
        localService: false,
        name: "Microsoft Andrew Online (Natural)",
        voiceURI: "Microsoft Andrew Online (Natural)",
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
        calls.push({
          rate: utterance.rate,
          text: utterance.text,
          voice: utterance.voice?.name ?? null,
          volume: utterance.volume,
        });
        activeTimer = window.setTimeout(() => {
          utterance.onboundary?.(new Event("boundary") as Event & { charIndex: number });
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
  const headingOrder = await page.evaluate(() => {
    const tools = document.querySelector(".reader-tools");
    const ttsHeading = tools?.querySelector("section[aria-label='TTS queue'] h2");
    const appearanceHeading = tools?.querySelector("section[aria-label='Appearance'] h2");

    if (!ttsHeading || !appearanceHeading) {
      return false;
    }

    return Boolean(ttsHeading.compareDocumentPosition(appearanceHeading) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(headingOrder).toBe(true);

  const ttsSettings = page.getByRole("group", { name: /tts settings/i });
  await expect(ttsSettings.getByLabel(/tts voice/i)).toBeVisible();
  await ttsSettings.getByLabel(/tts voice/i).selectOption("Microsoft Andrew Online (Natural)");
  await ttsSettings.getByLabel(/^tts rate$/i).fill("1.2");
  await ttsSettings.getByLabel(/tts volume/i).fill("0.85");

  const selectedText = await selectTextInIframe(page);
  expect(selectedText.length).toBeGreaterThan(0);

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBe(1);

  await page.getByRole("button", { name: /read aloud/i }).click();
  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBe(2);

  const firstCall = await page.evaluate(
    () =>
      (window as typeof window & { __ttsCalls: Array<{ rate: number; text: string; voice: string | null; volume: number }> }).__ttsCalls.at(-1),
  );
  expect(firstCall?.text).toContain(selectedText);
  expect(firstCall?.voice).toBe("Microsoft Andrew Online (Natural)");
  expect(firstCall?.rate).toBe(1.2);
  expect(firstCall?.volume).toBe(0.85);

  await page.getByRole("button", { name: /start tts/i }).click();
  await expect(page.getByText(/tts status: playing/i)).toBeVisible();
  await expect(page.frameLocator(".epub-root iframe").locator(".reader-tts-active-segment")).toHaveCount(1);
  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBeGreaterThan(1);
  const continuousCall = await page.evaluate(
    () =>
      (window as typeof window & { __ttsCalls: Array<{ rate: number; text: string; voice: string | null; volume: number }> }).__ttsCalls.at(-1),
  );
  expect(continuousCall?.voice).toBe("Microsoft Andrew Online (Natural)");
  expect(continuousCall?.rate).toBe(1.2);
  expect(continuousCall?.volume).toBe(0.85);

  await page.getByRole("button", { name: /pause tts/i }).click();
  await expect(page.getByText(/tts status: paused/i)).toBeVisible();

  await page.getByRole("button", { name: /resume tts/i }).click();
  await expect(page.getByText(/tts status: playing/i)).toBeVisible();

  await page.getByRole("button", { name: /stop tts/i }).click();
  await expect(page.getByText(/tts status: idle/i)).toBeVisible();
});
