import { existsSync, mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const repoBibleFixturePath =
  "The Holy Bible English Standard Version (ESV) (Crossway Bibles) (z-library.sk, 1lib.sk, z-lib.sk).epub";
const localBibleFixturePath = "tests/fixtures/local/bible-esv.epub";
const bibleFixturePath = process.env.BIBLE_FIXTURE_PATH ??
  (existsSync(localBibleFixturePath) ? localBibleFixturePath : repoBibleFixturePath);
const gatewayScreenshotDir = ".codex-gateway-artifacts/screenshots";

test.skip(!existsSync(bibleFixturePath), `Optional local Bible fixture not available at ${bibleFixturePath}`);

test("Bible paginated TTS keeps the spoken sentence translation note positioned at 1 Kings 3:3 @gateway-screenshot", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    let currentUtterance:
      | (SpeechSynthesisUtterance & {
          onend?: ((event: Event) => void) | null;
          onstart?: ((event: Event) => void) | null;
        })
      | undefined;

    class MockSpeechSynthesisUtterance {
      onstart: ((event: Event) => void) | null = null;
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

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        addEventListener() {
          return undefined;
        },
        cancel() {
          return undefined;
        },
        getVoices() {
          return [
            {
              default: true,
              lang: "en-US",
              localService: false,
              name: "Microsoft Ava Online (Natural)",
              voiceURI: "Microsoft Ava Online (Natural)",
            },
          ];
        },
        pause() {
          return undefined;
        },
        pending: false,
        removeEventListener() {
          return undefined;
        },
        resume() {
          return undefined;
        },
        speak(utterance: MockSpeechSynthesisUtterance) {
          currentUtterance = utterance as SpeechSynthesisUtterance & {
            onend?: ((event: Event) => void) | null;
            onstart?: ((event: Event) => void) | null;
          };
          calls.push(utterance.text);
          window.setTimeout(() => {
            utterance.onstart?.(new Event("start"));
          }, 20);
          window.setTimeout(() => {
            utterance.onboundary?.(new Event("boundary") as Event & { charIndex: number });
          }, 60);
        },
        speaking: false,
      },
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

    Object.defineProperty(window, "__finishCurrentTts", {
      configurable: true,
      value: () => {
        currentUtterance?.onend?.(new Event("end"));
      },
      writable: false,
    });
  });

  await page.route("http://localhost:8001/v1/models", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: [{ id: "local-reader-chat", object: "model" }],
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("http://localhost:8001/v1/completions", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        choices: [{ text: "当前句翻译" }],
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.setViewportSize({ width: 1900, height: 1400 });
  await page.goto("/");
  await page.setInputFiles("input[type=file]", bibleFixturePath);
  await expect(page).toHaveURL(/\/books\//);

  await page.getByRole("button", { name: /expand 1 kings/i }).click();
  await page.getByRole("button", { name: "Chapter 3", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /paginated mode/i }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /voice, speed, volume/i }).click();
  await page.getByRole("checkbox", { name: /show tts translation note/i }).click();
  await page.getByRole("button", { name: /start tts/i }).click();

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls.length))
    .toBeGreaterThan(0);

  await page.evaluate(() => (window as typeof window & { __finishCurrentTts: () => void }).__finishCurrentTts());
  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls.length))
    .toBeGreaterThan(1);

  await page.evaluate(() => (window as typeof window & { __finishCurrentTts: () => void }).__finishCurrentTts());
  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls.length))
    .toBeGreaterThan(2);

  const verseThreeUtterance = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls[2] ?? "",
  );
  expect(verseThreeUtterance.startsWith("Solomon loved the LORD")).toBe(true);

  const note = page.getByRole("status", { name: /spoken sentence translation/i });
  await expect(note).toBeVisible();
  await expect(note).toContainText("当前句翻译");

  mkdirSync(gatewayScreenshotDir, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: `${gatewayScreenshotDir}/bible-esv-tts-translation-note-1-kings-3-3.png`,
  });

  const noteBox = await note.boundingBox();
  const ttsBlockBox = await page.evaluate(() => {
    const iframe = document.querySelector(".epub-root iframe") as HTMLIFrameElement | null;
    const iframeRect = iframe?.getBoundingClientRect();
    const active = iframe?.contentDocument?.querySelector<HTMLElement>(".reader-tts-active-segment");
    const block =
      active?.closest<HTMLElement>("p, li, blockquote, h1, h2, h3, h4, h5, h6, div, section, article") ?? active;
    const blockRect = block?.getBoundingClientRect();
    const activeRect = active?.getBoundingClientRect();

    if (!iframeRect || !blockRect || !activeRect) {
      return null;
    }

    return {
      active: {
        bottom: iframeRect.top + activeRect.bottom,
        left: iframeRect.left + activeRect.left,
        right: iframeRect.left + activeRect.right,
        top: iframeRect.top + activeRect.top,
      },
      block: {
        bottom: iframeRect.top + blockRect.bottom,
        left: iframeRect.left + blockRect.left,
        right: iframeRect.left + blockRect.right,
        top: iframeRect.top + blockRect.top,
      },
    };
  });

  expect(noteBox).not.toBeNull();
  expect(ttsBlockBox).not.toBeNull();

  const noteRect = {
    bottom: noteBox!.y + noteBox!.height,
    left: noteBox!.x,
    right: noteBox!.x + noteBox!.width,
    top: noteBox!.y,
  };

  expect(noteRect.left).toBeGreaterThan(ttsBlockBox!.block.right);
  expect(noteRect.top).toBeGreaterThanOrEqual(ttsBlockBox!.active.top - 12);
  expect(noteRect.bottom).toBeLessThanOrEqual(page.viewportSize()!.height - 12);
  expect(
    noteRect.right <= ttsBlockBox!.active.left ||
      noteRect.left >= ttsBlockBox!.active.right ||
      noteRect.bottom <= ttsBlockBox!.active.top ||
      noteRect.top >= ttsBlockBox!.active.bottom,
  ).toBe(true);
});
