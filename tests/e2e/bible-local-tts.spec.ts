import { existsSync, mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const repoBibleFixturePath =
  "The Holy Bible English Standard Version (ESV) (Crossway Bibles) (z-library.sk, 1lib.sk, z-lib.sk).epub";
const gatewayBibleFixturePath = "bible.epub";
const localBibleFixturePath = "tests/fixtures/local/bible-esv.epub";
const requestedLlmApiUrl = "http://192.168.1.31:8001/v1/chat/completions";
const requestedGrammarLlmApiUrl = "http://192.168.1.31:8004/v1/chat/completions";
const bibleFixturePath = process.env.BIBLE_FIXTURE_PATH ??
  (existsSync(gatewayBibleFixturePath)
    ? gatewayBibleFixturePath
    : existsSync(localBibleFixturePath)
      ? localBibleFixturePath
      : repoBibleFixturePath);
const gatewayScreenshotDir = ".codex-gateway-artifacts/screenshots";

test.skip(!existsSync(bibleFixturePath), `Optional local Bible fixture not available at ${bibleFixturePath}`);

test("Bible continuous tts translation note is centered on the 1 Kings 3:3 reading block @gateway-screenshot", async ({ page }) => {
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

  await page.route("http://192.168.1.31:8001/v1/models", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: [{ id: "local-reader-chat", object: "model" }],
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("http://192.168.1.31:8001/v1/completions", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        choices: [{ text: "当前句翻译" }],
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("http://192.168.1.31:8001/v1/chat/completions", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        choices: [{ message: { content: "当前句翻译" } }],
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("http://192.168.1.31:8004/v1/chat/completions", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        choices: [{ message: { content: "语法解释" } }],
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.setViewportSize({ width: 1900, height: 1400 });
  await page.goto("/");
  const storedSettings = await page.evaluate(
    async ({ grammarLlmApiUrl, llmApiUrl }) => {
      const request = indexedDB.open("epub-reader");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("books")) {
            const books = db.createObjectStore("books", { keyPath: "id" });
            books.createIndex("importHash", "importHash");
            books.createIndex("title", "title");
            books.createIndex("author", "author");
          }
          if (!db.objectStoreNames.contains("bookFiles")) {
            db.createObjectStore("bookFiles", { keyPath: "bookId" });
          }
          if (!db.objectStoreNames.contains("progress")) {
            db.createObjectStore("progress", { keyPath: "bookId" });
          }
          if (!db.objectStoreNames.contains("annotations")) {
            const annotations = db.createObjectStore("annotations", { keyPath: "id" });
            annotations.createIndex("bookId", "bookId");
            annotations.createIndex("spineItemId", "spineItemId");
            annotations.createIndex("kind", "kind");
            annotations.createIndex("updatedAt", "updatedAt");
          }
          if (!db.objectStoreNames.contains("settings")) {
            db.createObjectStore("settings", { keyPath: "id" });
          }
        };
        request.onsuccess = () => resolve(request.result);
      });

      const settingsRecord = {
        apiKey: "",
        columnCount: 1,
        contentBackgroundColor: "#f6edde",
        contentPadding: 32,
        fontFamily: "book",
        fontScale: 1,
        geminiModel: "gemini-2.5-flash",
        grammarLlmApiUrl,
        grammarLlmModel: "",
        id: "settings",
        letterSpacing: 0,
        lineHeight: 1.7,
        llmApiUrl,
        localLlmModel: "",
        maxLineWidth: 760,
        paragraphIndent: 1.8,
        paragraphSpacing: 0.85,
        readingMode: "scrolled",
        targetLanguage: "zh-CN",
        targetLanguageCustomized: false,
        theme: "sepia",
        translationProvider: "local_llm",
        ttsFollowPlayback: false,
        ttsRate: 1,
        ttsSentenceTranslationEnabled: false,
        ttsSentenceTranslationFontScale: 1,
        ttsVoice: "",
        ttsVolume: 1,
      };

      const transaction = db.transaction("settings", "readwrite");
      transaction.objectStore("settings").put(settingsRecord);
      await new Promise<void>((resolve, reject) => {
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
      });

      const readTransaction = db.transaction("settings", "readonly");
      const getRequest = readTransaction.objectStore("settings").get("settings");
      const settings = await new Promise<{ grammarLlmApiUrl?: string; llmApiUrl?: string } | undefined>(
        (resolve, reject) => {
          getRequest.onerror = () => reject(getRequest.error);
          getRequest.onsuccess = () => resolve(getRequest.result);
        },
      );
      db.close();

      return {
        grammarLlmApiUrl: settings?.grammarLlmApiUrl ?? "",
        llmApiUrl: settings?.llmApiUrl ?? "",
      };
    },
    {
      grammarLlmApiUrl: requestedGrammarLlmApiUrl,
      llmApiUrl: requestedLlmApiUrl,
    },
  );
  expect(storedSettings).toEqual({
    grammarLlmApiUrl: requestedGrammarLlmApiUrl,
    llmApiUrl: requestedLlmApiUrl,
  });
  await page.reload();
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
  const ttsMetrics = await page.evaluate(() => {
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

    const candidateRects = Array.from(block.getClientRects()).filter(
      (rect) => rect.right > rect.left && rect.bottom > rect.top,
    );
    const anchorRect =
      candidateRects.find((rect) => rect.right > activeRect.left && rect.left < activeRect.right) ??
      candidateRects[0] ??
      blockRect;
    const columnRects = candidateRects.filter((rect) => rect.right > anchorRect.left && rect.left < anchorRect.right);
    const readingRect = columnRects.reduce(
      (aggregate, rect) => ({
        bottom: Math.max(aggregate.bottom, rect.bottom),
        left: Math.min(aggregate.left, rect.left),
        right: Math.max(aggregate.right, rect.right),
        top: Math.min(aggregate.top, rect.top),
      }),
      {
        bottom: anchorRect.bottom,
        left: anchorRect.left,
        right: anchorRect.right,
        top: anchorRect.top,
      },
    );

    return {
      active: {
        bottom: iframeRect.top + activeRect.bottom,
        left: iframeRect.left + activeRect.left,
        right: iframeRect.left + activeRect.right,
        top: iframeRect.top + activeRect.top,
      },
      reading: {
        bottom: iframeRect.top + readingRect.bottom,
        left: iframeRect.left + readingRect.left,
        right: iframeRect.left + readingRect.right,
        top: iframeRect.top + readingRect.top,
      },
    };
  });

  expect(noteBox).not.toBeNull();
  expect(ttsMetrics).not.toBeNull();
  expect(noteBox!.width).toBeCloseTo(600, 1);

  const noteRect = {
    bottom: noteBox!.y + noteBox!.height,
    left: noteBox!.x,
    right: noteBox!.x + noteBox!.width,
    top: noteBox!.y,
  };
  const noteCenterX = (noteRect.left + noteRect.right) / 2;
  const runtimeReadingCenterX = Number(await note.getAttribute("data-reading-center-x"));

  expect(Number.isFinite(runtimeReadingCenterX)).toBe(true);
  expect(Math.abs(noteCenterX - runtimeReadingCenterX)).toBeLessThanOrEqual(8);
  expect(noteRect.top).toBeGreaterThanOrEqual(12);
  expect(noteRect.bottom).toBeLessThanOrEqual(page.viewportSize()!.height - 12);
  expect(
    noteRect.right <= ttsMetrics!.active.left ||
      noteRect.left >= ttsMetrics!.active.right ||
      noteRect.bottom <= ttsMetrics!.active.top ||
      noteRect.top >= ttsMetrics!.active.bottom,
  ).toBe(true);
});
