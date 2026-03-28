import { expect, test } from "@playwright/test";
import { selectTextInIframe } from "./helpers/epubSelection";

const fixturePath = "tests/fixtures/epub/minimal-valid.epub";
const paginatedChapterHeadingFixturePath = "tests/fixtures/epub/paginated-chapter-heading.epub";
const paginatedFixturePath = "tests/fixtures/epub/paginated-long.epub";
const paginatedChunkedSentenceFixturePath = "tests/fixtures/epub/paginated-chunked-sentence.epub";
const paginatedPageStartFixturePath = "tests/fixtures/epub/paginated-page-start.epub";
const paginatedMultiChapterFixturePath = "tests/fixtures/epub/paginated-multi-chapter.epub";
const paginatedTocHeadingFixturePath = "tests/fixtures/epub/paginated-toc-heading.epub";

test("browser tts supports selection playback and continuous reader controls", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ rate: number; text: string; voice: string | null; volume: number }> = [];
    let paused = false;
    let activeTimer: number | undefined;
    let activeBoundaryTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

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
        if (activeBoundaryTimer) {
          clearTimeout(activeBoundaryTimer);
          activeBoundaryTimer = undefined;
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
          utterance.onstart?.(new Event("start"));
          activeBoundaryTimer = window.setTimeout(() => {
            utterance.onboundary?.(new Event("boundary") as Event & { charIndex: number });
            if (!paused) {
              utterance.onend?.(new Event("end"));
            }
          }, 500);
        }, 150);
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

  await page.route("http://localhost:8001/v1/chat/completions", async (route) => {
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
  await expect(page.getByRole("heading", { name: /tts queue/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /appearance/i })).toBeVisible();
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

  await page.getByRole("button", { name: /voice, speed, volume/i }).click();

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

  const ttsQueue = page.getByRole("region", { name: /tts queue/i });
  const ttsBadge = ttsQueue.locator(".reader-tts-badge");

  await page.getByRole("button", { name: /start tts/i }).click();
  await expect(ttsBadge).toHaveText(/playing/i);
  await page.waitForTimeout(250);
  await expect(page.frameLocator(".epub-root iframe").locator(".reader-tts-active-segment")).toHaveCount(0);
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
  await expect(ttsBadge).toHaveText(/paused/i);

  await page.getByRole("button", { name: /resume tts/i }).click();
  await expect(ttsBadge).toHaveText(/playing/i);

  await page.getByRole("button", { name: /stop tts/i }).click();
  await expect(ttsBadge).toHaveText(/ready/i);
});

test("chrome allows start tts and read aloud when browser speech synthesis and english voices are available", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ rate: number; text: string; voice: string | null; volume: number }> = [];
    let activeTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (X11; Linux x86_64) Chrome/123.0",
    });

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

    const voices = [
      {
        default: true,
        lang: "en-US",
        localService: false,
        name: "Google US English",
        voiceURI: "Google US English",
      },
    ];

    const speechSynthesis = {
      addEventListener() {
        return undefined;
      },
      cancel() {
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = undefined;
        }
      },
      getVoices() {
        return voices;
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
        calls.push({
          rate: utterance.rate,
          text: utterance.text,
          voice: utterance.voice?.name ?? null,
          volume: utterance.volume,
        });
        activeTimer = window.setTimeout(() => {
          utterance.onstart?.(new Event("start"));
          utterance.onend?.(new Event("end"));
        }, 50);
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

  await page.route("http://localhost:8001/v1/chat/completions", async (route) => {
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
  await expect(page.getByRole("button", { name: /start tts/i })).toBeEnabled();

  const selectedText = await selectTextInIframe(page);
  expect(selectedText.length).toBeGreaterThan(0);

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBe(1);

  await page.getByRole("button", { name: /read aloud/i }).click();
  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBe(2);

  const selectionCall = await page.evaluate(
    () =>
      (window as typeof window & { __ttsCalls: Array<{ text: string; voice: string | null }> }).__ttsCalls.at(-1),
  );
  expect(selectionCall?.text).toContain(selectedText);
  expect(selectionCall?.voice).toBe("Google US English");

  await page.getByRole("button", { name: /start tts/i }).click();
  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBeGreaterThan(2);
});

test("paginated mode keeps continuous tts aligned to one paragraph at a time", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ rate: number; text: string; voice: string | null; volume: number }> = [];
    let paused = false;
    let activeTimer: number | undefined;
    let activeBoundaryTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

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
        if (activeBoundaryTimer) {
          clearTimeout(activeBoundaryTimer);
          activeBoundaryTimer = undefined;
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
          utterance.onstart?.(new Event("start"));
          activeBoundaryTimer = window.setTimeout(() => {
            utterance.onboundary?.(
              Object.assign(new Event("boundary"), {
                charIndex: Math.min(6, utterance.text.length),
              }) as Event & { charIndex: number },
            );
            if (!paused) {
              utterance.onend?.(new Event("end"));
            }
          }, 500);
        }, 150);
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

  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedFixturePath);
  await expect(page).toHaveURL(/\/books\//);
  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");

  await page.getByRole("button", { name: /start tts/i }).click();

  await page.waitForTimeout(50);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const iframe = document.querySelector(".epub-root iframe") as HTMLIFrameElement | null;
        return iframe?.contentDocument?.querySelectorAll(".reader-tts-active-segment").length ?? 0;
      }),
    )
    .toBe(0);
  await page.waitForTimeout(200);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const iframe = document.querySelector(".epub-root iframe") as HTMLIFrameElement | null;
        return iframe?.contentDocument?.querySelectorAll(".reader-tts-active-segment").length ?? 0;
      }),
    )
    .toBe(1);

  const [firstCallText, activeParagraphText] = await Promise.all([
    page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls[0]?.text ?? ""),
    page.evaluate(() => {
      const iframe = document.querySelector(".epub-root iframe") as HTMLIFrameElement | null;
      const active = iframe?.contentDocument?.querySelector(".reader-tts-active-segment");
      const paragraph = active?.closest("p");
      return paragraph?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    }),
  ]);

  expect(firstCallText).toBe(activeParagraphText);
});

test("paginated mode starts continuous tts from the current page's first visible paragraph after a real page turn", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string }> = [];
    let activeTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

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
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = undefined;
        }
      },
      getVoices() {
        return voices;
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
        calls.push({
          text: utterance.text,
        });
        activeTimer = window.setTimeout(() => {
          utterance.onstart?.(new Event("start"));
        }, 50);
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

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedMultiChapterFixturePath);
  await expect(page).toHaveURL(/\/books\//);
  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");

  const readVisibleFrameState = () =>
    page.evaluate(() => {
      const root = document.querySelector(".epub-root");
      const iframes = Array.from(root?.querySelectorAll<HTMLIFrameElement>("iframe") ?? []);
      const rootRect = root?.getBoundingClientRect();
      let bestFrame: HTMLIFrameElement | null = null;
      let bestFrameIndex = -1;
      let bestArea = -1;

      for (const [index, frame] of iframes.entries()) {
        const rect = frame.getBoundingClientRect();
        const visibleLeft = Math.max(rootRect?.left ?? 0, rect.left);
        const visibleRight = Math.min(rootRect?.right ?? 0, rect.right);
        const visibleTop = Math.max(rootRect?.top ?? 0, rect.top);
        const visibleBottom = Math.min(rootRect?.bottom ?? 0, rect.bottom);
        const area = Math.max(0, visibleRight - visibleLeft) * Math.max(0, visibleBottom - visibleTop);

        if (area > bestArea) {
          bestArea = area;
          bestFrame = frame;
          bestFrameIndex = index;
        }
      }

      const container = root?.querySelector<HTMLElement>(".epub-container");
      const doc = bestFrame?.contentDocument ?? null;
      const win = bestFrame?.contentWindow ?? null;
      const paragraphs = Array.from(doc?.querySelectorAll<HTMLElement>("p") ?? []);
      const viewportWidth = win?.innerWidth || doc?.documentElement.clientWidth || doc?.body.clientWidth || 0;
      const viewportHeight = win?.innerHeight || doc?.documentElement.clientHeight || doc?.body.clientHeight || 0;
      let firstVisibleParagraph = "";
      let bestTop = Number.POSITIVE_INFINITY;
      let bestLeft = Number.POSITIVE_INFINITY;

      for (const paragraph of paragraphs) {
        const rect = paragraph.getBoundingClientRect();
        const visibleLeft = Math.max(0, rect.left);
        const visibleRight = Math.min(viewportWidth, rect.right);
        const visibleTop = Math.max(0, rect.top);
        const visibleBottom = Math.min(viewportHeight, rect.bottom);
        const visibleWidth = visibleRight - visibleLeft;
        const visibleHeight = visibleBottom - visibleTop;

        if (visibleWidth <= 1 || visibleHeight <= 1) {
          continue;
        }

        if (visibleTop < bestTop || (visibleTop === bestTop && visibleLeft < bestLeft)) {
          bestTop = visibleTop;
          bestLeft = visibleLeft;
          firstVisibleParagraph = paragraph.textContent?.replace(/\s+/g, " ").trim() ?? "";
        }
      }

      return {
        frameIndex: bestFrameIndex,
        firstVisibleParagraph,
        scrollLeft: container?.scrollLeft ?? 0,
      };
    });

  await expect
    .poll(async () => (await readVisibleFrameState()).frameIndex)
    .toBeGreaterThanOrEqual(0);
  const initialFrameState = await readVisibleFrameState();
  const initialScrollLeft = initialFrameState.scrollLeft;
  expect(initialFrameState.frameIndex).toBeGreaterThanOrEqual(0);

  await page.locator(".epub-root iframe").nth(initialFrameState.frameIndex).contentFrame().locator("body").click({
    position: {
      x: 10,
      y: 10,
    },
  });
  await expect
    .poll(async () =>
      page.evaluate(() => ({
        activeTag: document.activeElement?.tagName ?? null,
        activeTopbar: document.activeElement instanceof Element ? Boolean(document.activeElement.closest(".reader-topbar")) : false,
      })),
    )
    .toEqual({
      activeTag: "IFRAME",
      activeTopbar: false,
    });
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () =>
      readVisibleFrameState().then((state) => state.scrollLeft),
    )
    .toBeGreaterThan(initialScrollLeft);

  const firstVisibleParagraph = (await readVisibleFrameState()).firstVisibleParagraph;

  expect(firstVisibleParagraph.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: /start tts/i }).click();
  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBeGreaterThan(0);

  const firstCallText = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls[0]?.text ?? "",
  );

  expect(firstCallText).toBe(firstVisibleParagraph);
});

test("paginated mode starts continuous tts from the actual first visible text on the current page", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string }> = [];
    let activeTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

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
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = undefined;
        }
      },
      getVoices() {
        return voices;
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
        calls.push({
          text: utterance.text,
        });
        activeTimer = window.setTimeout(() => {
          utterance.onstart?.(new Event("start"));
        }, 50);
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

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedPageStartFixturePath);
  await expect(page).toHaveURL(/\/books\//);

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const root = document.querySelector(".epub-root");
        const container = root?.querySelector<HTMLElement>(".epub-container");
        return (
          root?.getAttribute("data-page-kind") === "prose" &&
          (container?.scrollWidth ?? 0) > (container?.clientWidth ?? 0)
        );
      }),
    )
    .toBe(true);

  await page.getByRole("button", { name: /next page/i }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const container = document.querySelector<HTMLElement>(".epub-root .epub-container");
        return container?.scrollLeft ?? 0;
      }),
    )
    .toBeGreaterThan(0);

  const pageStartSnippet = await page.evaluate(() => {
    const root = document.querySelector(".epub-root");
    const container = root?.querySelector<HTMLElement>(".epub-container");
    const frame = root?.querySelector<HTMLIFrameElement>("iframe");
    const doc = frame?.contentDocument;
    if (!root || !container || !frame || !doc) {
      return "";
    }

    const pageLeft = container.scrollLeft;
    const pageRight = pageLeft + container.clientWidth;
    const viewportHeight = Math.round(root.getBoundingClientRect().height);
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const range = doc.createRange();

    const normalizeSlice = (textNode: Node, offset: number) => {
      if (textNode.nodeType !== Node.TEXT_NODE) {
        return "";
      }

      const text = textNode.textContent ?? "";
      let cursor = Math.max(0, Math.min(offset, text.length));
      while (cursor > 0 && /\S/.test(text[cursor - 1] ?? "")) {
        cursor -= 1;
      }
      while (cursor < text.length && /\s/.test(text[cursor] ?? "")) {
        cursor += 1;
      }

      return text.slice(cursor, cursor + 42).replace(/\s+/g, " ").trim();
    };

    while (true) {
      const nextNode = walker.nextNode();
      if (!nextNode || nextNode.nodeType !== Node.TEXT_NODE) {
        break;
      }

      const text = nextNode.textContent ?? "";
      for (let offset = 0; offset < text.length; offset += 1) {
        if (/\s/.test(text[offset] ?? "")) {
          continue;
        }

        range.setStart(nextNode, offset);
        range.setEnd(nextNode, Math.min(text.length, offset + 1));
        const rects = Array.from(range.getClientRects());
        const isVisibleOnCurrentPage = rects.some(
          (rect) =>
            rect.left >= pageLeft &&
            rect.right <= pageRight + 1 &&
            rect.top >= 0 &&
            rect.bottom <= viewportHeight + 1,
        );
        if (!isVisibleOnCurrentPage) {
          continue;
        }

        const snippet = normalizeSlice(nextNode, offset);
        if (snippet.length > 0) {
          return snippet;
        }
      }
    }

    return "";
  });

  expect(pageStartSnippet.length).toBeGreaterThan(6);

  await page.getByRole("button", { name: /start tts/i }).click();
  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBeGreaterThan(0);

  const firstCallText = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls[0]?.text ?? "",
  );

  expect(firstCallText.startsWith(pageStartSnippet)).toBe(true);
});

test("paginated mode starts continuous tts from heading text on a chapter's first page", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string }> = [];
    let activeTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

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
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = undefined;
        }
      },
      getVoices() {
        return voices;
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
        calls.push({
          text: utterance.text,
        });
        activeTimer = window.setTimeout(() => {
          utterance.onstart?.(new Event("start"));
        }, 50);
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

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedChapterHeadingFixturePath);
  await expect(page).toHaveURL(/\/books\//);

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");

  const readPageStartSnippet = () =>
    page.evaluate(() => {
      const root = document.querySelector(".epub-root");
      const container = root?.querySelector<HTMLElement>(".epub-container");
      const frame = root?.querySelector<HTMLIFrameElement>("iframe");
      const doc = frame?.contentDocument;
      if (!root || !container || !frame || !doc) {
        return "";
      }

      const pageLeft = container.scrollLeft;
      const pageRight = pageLeft + container.clientWidth;
      const viewportHeight = Math.round(root.getBoundingClientRect().height);
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      const range = doc.createRange();

      while (true) {
        const nextNode = walker.nextNode();
        if (!nextNode || nextNode.nodeType !== Node.TEXT_NODE) {
          break;
        }

        const text = nextNode.textContent ?? "";
        for (let offset = 0; offset < text.length; offset += 1) {
          if (/\s/.test(text[offset] ?? "")) {
            continue;
          }

          range.setStart(nextNode, offset);
          range.setEnd(nextNode, Math.min(text.length, offset + 1));
          const rects = Array.from(range.getClientRects());
          const isVisibleOnCurrentPage = rects.some(
            (rect) =>
              rect.left >= pageLeft &&
              rect.right <= pageRight + 1 &&
              rect.top >= 0 &&
              rect.bottom <= viewportHeight + 1,
          );
          if (!isVisibleOnCurrentPage) {
            continue;
          }

          let cursor = offset;
          while (cursor > 0 && /\S/.test(text[cursor - 1] ?? "")) {
            cursor -= 1;
          }
          while (cursor < text.length && /\s/.test(text[cursor] ?? "")) {
            cursor += 1;
          }

          return text.slice(cursor, cursor + 42).replace(/\s+/g, " ").trim();
        }
      }

      return "";
    });

  await expect.poll(readPageStartSnippet).toBe("Chapter Seven");
  const pageStartSnippet = await readPageStartSnippet();

  await page.getByRole("button", { name: /start tts/i }).click();
  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBeGreaterThan(0);

  const firstCallText = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls[0]?.text ?? "",
  );

  expect(firstCallText).toBe(pageStartSnippet);
});

test("toc navigation uses the chapter target for the first start tts after jumping to a heading-led chapter", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string }> = [];
    let activeTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

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
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = undefined;
        }
      },
      getVoices() {
        return voices;
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
        calls.push({
          text: utterance.text,
        });
        activeTimer = window.setTimeout(() => {
          utterance.onstart?.(new Event("start"));
        }, 50);
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

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedTocHeadingFixturePath);
  await expect(page).toHaveURL(/\/books\//);

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");

  await page.getByRole("button", { name: /^1\. Third$/ }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.querySelector(".epub-root");
        const frame = root?.querySelector<HTMLIFrameElement>("iframe");
        const doc = frame?.contentDocument;
        if (!doc) {
          return "";
        }

        return doc.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
      }),
    )
    .toContain("THIRD");

  await page.getByRole("button", { name: /start tts/i }).click();
  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBeGreaterThan(0);

  const firstCallText = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls[0]?.text ?? "",
  );

  expect(firstCallText).toBe("1 THIRD");
});

test("same-tab refresh preserves the toc-driven tts start target", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string }> = [];
    let activeTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

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
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = undefined;
        }
      },
      getVoices() {
        return voices;
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
        calls.push({
          text: utterance.text,
        });
        activeTimer = window.setTimeout(() => {
          utterance.onstart?.(new Event("start"));
        }, 50);
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

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedTocHeadingFixturePath);
  await expect(page).toHaveURL(/\/books\//);

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");

  await page.getByRole("button", { name: /^1\. Third$/ }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const frame = document.querySelector(".epub-root iframe");
        const doc = frame && frame.contentDocument;
        return doc?.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      }),
    )
    .toContain("THIRD");

  await page.reload({ waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/books\//);
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");

  await page.getByRole("button", { name: /start tts/i }).click();
  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBeGreaterThan(0);

  const firstCallText = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls[0]?.text ?? "",
  );

  expect(firstCallText).toBe("1 THIRD");
});

test("paginated mode starts continuous tts from the current long chapter page's first visible paragraph", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string }> = [];
    let activeTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

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
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = undefined;
        }
      },
      getVoices() {
        return voices;
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
        calls.push({
          text: utterance.text,
        });
        activeTimer = window.setTimeout(() => {
          utterance.onstart?.(new Event("start"));
        }, 50);
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

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedFixturePath);
  await expect(page).toHaveURL(/\/books\//);
  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");

  const readVisiblePageState = () =>
    page.evaluate(() => {
      const root = document.querySelector(".epub-root");
      const container = root?.querySelector<HTMLElement>(".epub-container");
      const frame = root?.querySelector<HTMLIFrameElement>("iframe");
      const doc = frame?.contentDocument ?? null;
      const hostRect = root?.getBoundingClientRect();
      const paragraphs = Array.from(doc?.querySelectorAll<HTMLElement>("p") ?? []);
      let firstVisibleParagraph = "";
      let bestLeft = Number.POSITIVE_INFINITY;
      let bestTop = Number.POSITIVE_INFINITY;

      for (const paragraph of paragraphs) {
        const rect = paragraph.getBoundingClientRect();
        const visibleLeft = Math.max(0, rect.left);
        const visibleRight = Math.min(hostRect?.width ?? 0, rect.right);
        const visibleTop = Math.max(0, rect.top);
        const visibleBottom = Math.min(hostRect?.height ?? 0, rect.bottom);
        const visibleWidth = visibleRight - visibleLeft;
        const visibleHeight = visibleBottom - visibleTop;

        if (visibleWidth <= 1 || visibleHeight <= 1) {
          continue;
        }

        if (visibleLeft < bestLeft || (visibleLeft === bestLeft && visibleTop < bestTop)) {
          bestLeft = visibleLeft;
          bestTop = visibleTop;
          firstVisibleParagraph = paragraph.textContent?.replace(/\s+/g, " ").trim() ?? "";
        }
      }

      return {
        clientWidth: container?.clientWidth ?? 0,
        firstVisibleParagraph,
        scrollWidth: container?.scrollWidth ?? 0,
        scrollLeft: container?.scrollLeft ?? 0,
      };
    });

  await expect
    .poll(async () => {
      const state = await readVisiblePageState();
      return state.scrollWidth > state.clientWidth && state.clientWidth > 0;
    })
    .toBe(true);
  const initialScrollLeft = (await readVisiblePageState()).scrollLeft;

  await page.frameLocator(".epub-root iframe").locator("body").click({
    position: {
      x: 10,
      y: 10,
    },
  });
  await expect
    .poll(async () =>
      page.evaluate(() => ({
        activeTag: document.activeElement?.tagName ?? null,
        activeTopbar: document.activeElement instanceof Element ? Boolean(document.activeElement.closest(".reader-topbar")) : false,
      })),
    )
    .toEqual({
      activeTag: "IFRAME",
      activeTopbar: false,
    });
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await readVisiblePageState()).scrollLeft)
    .toBeGreaterThan(initialScrollLeft);

  const firstVisibleParagraph = (await readVisiblePageState()).firstVisibleParagraph;
  expect(firstVisibleParagraph.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: /start tts/i }).click();
  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBeGreaterThan(0);

  const firstCallText = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls[0]?.text ?? "",
  );

  expect(firstCallText).toBe(firstVisibleParagraph);
});

test("paginated mode clears the current selection and starts continuous tts from that selection start", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string }> = [];
    let activeTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

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
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = undefined;
        }
      },
      getVoices() {
        return voices;
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
        calls.push({
          text: utterance.text,
        });
        activeTimer = window.setTimeout(() => {
          utterance.onstart?.(new Event("start"));
        }, 50);
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

  const readVisibleFrameState = () =>
    page.evaluate(() => {
      const root = document.querySelector(".epub-root");
      const iframes = Array.from(root?.querySelectorAll<HTMLIFrameElement>("iframe") ?? []);
      const rootRect = root?.getBoundingClientRect();
      let bestFrame: HTMLIFrameElement | null = null;
      let bestFrameIndex = -1;
      let bestArea = -1;

      for (const [index, frame] of iframes.entries()) {
        const rect = frame.getBoundingClientRect();
        const visibleLeft = Math.max(rootRect?.left ?? 0, rect.left);
        const visibleRight = Math.min(rootRect?.right ?? 0, rect.right);
        const visibleTop = Math.max(rootRect?.top ?? 0, rect.top);
        const visibleBottom = Math.min(rootRect?.bottom ?? 0, rect.bottom);
        const area = Math.max(0, visibleRight - visibleLeft) * Math.max(0, visibleBottom - visibleTop);

        if (area > bestArea) {
          bestArea = area;
          bestFrame = frame;
          bestFrameIndex = index;
        }
      }

      const container = root?.querySelector<HTMLElement>(".epub-container");
      const doc = bestFrame?.contentDocument ?? null;
      const win = bestFrame?.contentWindow ?? null;
      const paragraphs = Array.from(doc?.querySelectorAll<HTMLElement>("p") ?? []);
      const viewportWidth = win?.innerWidth || doc?.documentElement.clientWidth || doc?.body.clientWidth || 0;
      const viewportHeight = win?.innerHeight || doc?.documentElement.clientHeight || doc?.body.clientHeight || 0;
      let firstVisibleParagraph = "";
      let bestTop = Number.POSITIVE_INFINITY;
      let bestLeft = Number.POSITIVE_INFINITY;

      for (const paragraph of paragraphs) {
        const rect = paragraph.getBoundingClientRect();
        const visibleLeft = Math.max(0, rect.left);
        const visibleRight = Math.min(viewportWidth, rect.right);
        const visibleTop = Math.max(0, rect.top);
        const visibleBottom = Math.min(viewportHeight, rect.bottom);
        const visibleWidth = visibleRight - visibleLeft;
        const visibleHeight = visibleBottom - visibleTop;

        if (visibleWidth <= 1 || visibleHeight <= 1) {
          continue;
        }

        if (visibleTop < bestTop || (visibleTop === bestTop && visibleLeft < bestLeft)) {
          bestTop = visibleTop;
          bestLeft = visibleLeft;
          firstVisibleParagraph = paragraph.textContent?.replace(/\s+/g, " ").trim() ?? "";
        }
      }

      return {
        firstVisibleParagraph,
        frameIndex: bestFrameIndex,
        scrollLeft: container?.scrollLeft ?? 0,
      };
    });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedMultiChapterFixturePath);
  await expect(page).toHaveURL(/\/books\//);
  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");
  await expect
    .poll(async () => (await readVisibleFrameState()).frameIndex)
    .toBeGreaterThanOrEqual(0);

  const frameState = await readVisibleFrameState();
  const selectionText = await page.locator(".epub-root iframe").nth(frameState.frameIndex).evaluate((node) => {
    const doc = node.contentDocument;
    const win = node.contentWindow;
    if (!doc || !win) {
      return "";
    }

    const paragraphs = Array.from(doc.querySelectorAll<HTMLElement>("p"));
    const viewportWidth = win.innerWidth || doc.documentElement.clientWidth || doc.body.clientWidth;
    const viewportHeight = win.innerHeight || doc.documentElement.clientHeight || doc.body.clientHeight;
    let selectedText = "";

    for (const paragraph of paragraphs) {
      const rect = paragraph.getBoundingClientRect();
      const visibleLeft = Math.max(0, rect.left);
      const visibleRight = Math.min(viewportWidth, rect.right);
      const visibleTop = Math.max(0, rect.top);
      const visibleBottom = Math.min(viewportHeight, rect.bottom);
      const visibleWidth = visibleRight - visibleLeft;
      const visibleHeight = visibleBottom - visibleTop;

      if (visibleWidth <= 1 || visibleHeight <= 1) {
        continue;
      }

      const textNode = paragraph.firstChild;
      const text = textNode?.textContent ?? "";
      if (!textNode || text.length < 24) {
        continue;
      }

      let wordIndex = Math.min(24, text.length - 1);
      while (wordIndex > 0 && /\S/.test(text[wordIndex - 1] ?? "")) {
        wordIndex -= 1;
      }
      while (wordIndex < text.length && /\s/.test(text[wordIndex] ?? "")) {
        wordIndex += 1;
      }

      const selectionLength = Math.min(42, Math.max(12, text.length - wordIndex));

      const range = doc.createRange();
      range.setStart(textNode, wordIndex);
      range.setEnd(textNode, Math.min(text.length, wordIndex + selectionLength));
      const selection = win.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      doc.dispatchEvent(new Event("selectionchange"));
      selectedText = range.toString().replace(/\s+/g, " ").trim();
      break;
    }

    return selectedText;
  });

  expect(selectionText.length).toBeGreaterThan(8);
  const firstSelectedWord = selectionText.split(/\s+/)[0] ?? "";
  expect(firstSelectedWord.length).toBeGreaterThan(0);
  const ttsCallCountBeforeStart = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length,
  );

  await page.getByRole("button", { name: /start tts/i }).click();
  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBeGreaterThan(ttsCallCountBeforeStart);

  const latestCallText = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.at(-1)?.text ?? "",
  );

  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").nth(frameState.frameIndex).evaluate((node) => {
        const selection = node.contentWindow?.getSelection?.();
        return selection?.toString().trim() ?? "";
      }),
    )
    .toBe("");
  await expect(page.frameLocator(".epub-root iframe").locator(".reader-tts-active-segment")).toHaveText(firstSelectedWord);

  expect(latestCallText.startsWith(selectionText)).toBe(true);
  expect(latestCallText.length).toBeGreaterThan(selectionText.length);
});

test("scrolled mode starts continuous tts from the current text selection instead of falling back to chapter start", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string }> = [];
    let activeTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

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
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = undefined;
        }
      },
      getVoices() {
        return voices;
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
        calls.push({
          text: utterance.text,
        });
        activeTimer = window.setTimeout(() => {
          utterance.onstart?.(new Event("start"));
        }, 50);
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

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedFixturePath);
  await expect(page).toHaveURL(/\/books\//);
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "scrolled");
  await page.waitForFunction(() => {
    const frames = Array.from(document.querySelectorAll<HTMLIFrameElement>(".epub-root iframe"));
    return frames.some((frame) => {
      const doc = frame.contentDocument;
      return (doc?.querySelectorAll("p")[1]?.textContent?.length ?? 0) > 30;
    });
  });

  const iframeHandle = await page.locator(".epub-root iframe").first().elementHandle();
  const frame = await iframeHandle?.contentFrame();
  expect(frame).toBeTruthy();

  const paragraph = frame!.locator("p").nth(1);
  await paragraph.scrollIntoViewIfNeeded();
  await paragraph.selectText();
  await page.waitForTimeout(300);

  const selectionText = await frame!.evaluate(() => window.getSelection()?.toString().replace(/\s+/g, " ").trim() || "");

  expect(selectionText.length).toBeGreaterThan(8);
  const callCountBeforeStart = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length,
  );

  await page.getByRole("button", { name: /start tts/i }).click();
  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBeGreaterThan(callCountBeforeStart);

  const firstCallText = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.at(-1)?.text ?? "",
  );

  expect(firstCallText.startsWith(selectionText)).toBe(true);
  expect(firstCallText).toBe(selectionText);
});

test("scrolled mode start tts does not move the reader viewport while highlighting active speech", async ({ page }) => {
  await page.addInitScript(() => {
    let activeStartTimer: number | undefined;
    let activeBoundaryTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

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
        if (activeStartTimer) {
          clearTimeout(activeStartTimer);
          activeStartTimer = undefined;
        }
        if (activeBoundaryTimer) {
          clearTimeout(activeBoundaryTimer);
          activeBoundaryTimer = undefined;
        }
      },
      getVoices() {
        return voices;
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
        activeStartTimer = window.setTimeout(() => {
          utterance.onstart?.(new Event("start"));
          activeBoundaryTimer = window.setTimeout(() => {
            utterance.onboundary?.({ ...(new Event("boundary")), charIndex: 0 } as Event & { charIndex: number });
          }, 120);
        }, 50);
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
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedFixturePath);
  await expect(page).toHaveURL(/\/books\//);
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "scrolled");
  await page.waitForFunction(() => {
    const frame = document.querySelector<HTMLIFrameElement>(".epub-root iframe");
    return (frame?.contentDocument?.querySelectorAll("p").length ?? 0) > 4;
  });

  const metricsBefore = await page.locator(".epub-root iframe").first().evaluate((node) => {
    const iframe = node;
    const root = iframe.closest(".epub-root");
    const container = root?.querySelector<HTMLElement>(".epub-container");
    const paragraphs = Array.from(iframe.contentDocument?.querySelectorAll<HTMLParagraphElement>("p") ?? []);
    const target = paragraphs[2];
    if (!container || !target) {
      return null;
    }

    container.scrollTop = Math.max(0, target.getBoundingClientRect().top - 8);
    return {
      scrollTop: container.scrollTop,
      targetText: target.textContent?.replace(/\s+/g, " ").trim() ?? "",
    };
  });

  expect(metricsBefore?.targetText.length ?? 0).toBeGreaterThan(20);

  await page.getByRole("button", { name: /start tts/i }).click();

  await expect(page.frameLocator(".epub-root iframe").locator(".reader-tts-active-segment")).toHaveCount(1);

  const metricsAfter = await page.locator(".epub-root iframe").first().evaluate((node) => {
    const iframe = node;
    const root = iframe.closest(".epub-root");
    const container = root?.querySelector<HTMLElement>(".epub-container");
    const activeText =
      iframe.contentDocument?.querySelector(".reader-tts-active-segment")?.textContent?.replace(/\s+/g, " ").trim() ?? "";

    return {
      activeText,
      scrollTop: container?.scrollTop ?? 0,
    };
  });

  expect(metricsAfter.activeText.length).toBeGreaterThan(0);
  expect(Math.abs(metricsAfter.scrollTop - (metricsBefore?.scrollTop ?? 0))).toBeLessThan(4);
});

test("paginated mode starts an oversized paragraph by highlighting the first spoken word", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ rate: number; text: string; voice: string | null; volume: number }> = [];
    let activeTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

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
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = undefined;
        }
      },
      getVoices() {
        return voices;
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
        calls.push({
          rate: utterance.rate,
          text: utterance.text,
          voice: utterance.voice?.name ?? null,
          volume: utterance.volume,
        });
        activeTimer = window.setTimeout(() => {
          utterance.onstart?.(new Event("start"));
        }, 150);
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

  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedChunkedSentenceFixturePath);
  await expect(page).toHaveURL(/\/books\//);

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");
  await page.getByRole("button", { name: /start tts/i }).click();

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBe(1);

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const iframe = document.querySelector(".epub-root iframe") as HTMLIFrameElement | null;
        return iframe?.contentDocument?.querySelectorAll(".reader-tts-active-segment").length ?? 0;
      }),
    )
    .toBe(1);

  const comparison = await page.evaluate(() => {
    const iframe = document.querySelector(".epub-root iframe") as HTMLIFrameElement | null;
    const doc = iframe?.contentDocument;
    const active = doc?.querySelector(".reader-tts-active-segment");
    const firstCall = (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls[0]?.text ?? "";
    const activeText = active?.textContent?.replace(/\s+/g, " ").trim() ?? "";

    return {
      activeText,
      firstCall,
    };
  });

  expect(comparison.activeText).toBe(comparison.firstCall.split(/\s+/)[0]);
});

test("paginated mode keeps the active highlight on the exact spoken word at boundary time", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string; wordAtBoundary: string }> = [];
    let activeTimer: number | undefined;
    let activeBoundaryTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

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
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = undefined;
        }
        if (activeBoundaryTimer) {
          clearTimeout(activeBoundaryTimer);
          activeBoundaryTimer = undefined;
        }
      },
      getVoices() {
        return voices;
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
        const boundaryWord = "multiple";
        calls.push({
          text: utterance.text,
          wordAtBoundary: boundaryWord,
        });
        activeTimer = window.setTimeout(() => {
          utterance.onstart?.(new Event("start"));
          activeBoundaryTimer = window.setTimeout(() => {
            utterance.onboundary?.(
              Object.assign(new Event("boundary"), {
                charIndex: utterance.text.indexOf(boundaryWord),
              }) as Event & { charIndex: number },
            );
          }, 250);
        }, 150);
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

  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedChunkedSentenceFixturePath);
  await expect(page).toHaveURL(/\/books\//);
  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");
  await page.getByRole("button", { name: /start tts/i }).click();

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBe(1);

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const iframe = document.querySelector(".epub-root iframe") as HTMLIFrameElement | null;
        const activeText = iframe?.contentDocument?.querySelector(".reader-tts-active-segment")?.textContent ?? "";
        return activeText.replace(/\s+/g, " ").trim();
      }),
    )
    .toBe("multiple");
});

test("paginated mode keeps the active highlight on the exact repeated word occurrence", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string }> = [];
    let activeTimer: number | undefined;
    let activeBoundaryTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

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
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = undefined;
        }
        if (activeBoundaryTimer) {
          clearTimeout(activeBoundaryTimer);
          activeBoundaryTimer = undefined;
        }
      },
      getVoices() {
        return voices;
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
        calls.push({
          text: utterance.text,
        });
        activeTimer = window.setTimeout(() => {
          utterance.onstart?.(new Event("start"));
          activeBoundaryTimer = window.setTimeout(() => {
            utterance.onboundary?.(
              Object.assign(new Event("boundary"), {
                charIndex: utterance.text.indexOf("the later clauses"),
              }) as Event & { charIndex: number },
            );
          }, 250);
        }, 150);
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

  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedChunkedSentenceFixturePath);
  await expect(page).toHaveURL(/\/books\//);
  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");
  await page.getByRole("button", { name: /start tts/i }).click();

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBe(1);

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const iframe = document.querySelector(".epub-root iframe") as HTMLIFrameElement | null;
        const doc = iframe?.contentDocument;
        const active = doc?.querySelector(".reader-tts-active-segment");
        const activeText = active?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        const after = active?.nextSibling?.textContent ?? "";
        const before = active?.previousSibling?.textContent ?? "";

        return activeText === "the" && before.includes("reached") && after.includes("later clauses");
      }),
    )
    .toBe(true);
});

test("paginated mode keeps second-utterance highlighting stable when Edge only emits a sentence boundary", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string }> = [];
    let activeTimer: number | undefined;
    let activeBoundaryTimer: number | undefined;
    let activeEndTimer: number | undefined;
    let speakCount = 0;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

    class MockSpeechSynthesisUtterance {
      onstart: ((event: Event) => void) | null = null;
      onboundary: ((event: Event & { charIndex: number; name?: string }) => void) | null = null;
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
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = undefined;
        }
        if (activeBoundaryTimer) {
          clearTimeout(activeBoundaryTimer);
          activeBoundaryTimer = undefined;
        }
        if (activeEndTimer) {
          clearTimeout(activeEndTimer);
          activeEndTimer = undefined;
        }
      },
      getVoices() {
        return voices;
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
        const utteranceIndex = speakCount;
        speakCount += 1;
        calls.push({
          text: utterance.text,
        });

        activeTimer = window.setTimeout(() => {
          utterance.onstart?.(new Event("start"));

          if (utteranceIndex === 0) {
            activeBoundaryTimer = window.setTimeout(() => {
              utterance.onboundary?.(
                Object.assign(new Event("boundary"), {
                  charIndex: utterance.text.indexOf("multiple"),
                  name: "word",
                }) as Event & { charIndex: number; name?: string },
              );
            }, 160);
            activeEndTimer = window.setTimeout(() => {
              utterance.onend?.(new Event("end"));
            }, 260);
            return;
          }

          activeBoundaryTimer = window.setTimeout(() => {
            utterance.onboundary?.(
              Object.assign(new Event("boundary"), {
                charIndex: Math.max(0, utterance.text.length - 1),
                name: "sentence",
              }) as Event & { charIndex: number; name?: string },
            );
          }, 140);
        }, 50);
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

  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedChunkedSentenceFixturePath);
  await expect(page).toHaveURL(/\/books\//);
  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");
  await page.getByRole("button", { name: /start tts/i }).click();

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBe(2);

  const secondUtterance = await page.evaluate(
    () =>
      (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls[1]?.text ?? "",
  );
  expect(secondUtterance).not.toContain("The second paragraph is short");

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const iframe = document.querySelector(".epub-root iframe") as HTMLIFrameElement | null;
        const active = iframe?.contentDocument?.querySelector(".reader-tts-active-segment");

        return active?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      }),
    )
    .toBe("the");
});

test("paginated mode keeps later paragraph word boundaries anchored to their own paragraph", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string }> = [];
    const boundaryUtteranceIndexes: number[] = [];

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

    class MockSpeechSynthesisUtterance {
      onstart: ((event: Event) => void) | null = null;
      onboundary: ((event: Event & { charIndex: number; name?: string }) => void) | null = null;
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
        return undefined;
      },
      getVoices() {
        return voices;
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
        const utteranceIndex = calls.length;
        calls.push({
          text: utterance.text,
        });

        window.setTimeout(() => {
          utterance.onstart?.(new Event("start"));
          window.setTimeout(() => {
            boundaryUtteranceIndexes.push(utteranceIndex);
            utterance.onboundary?.(
              Object.assign(new Event("boundary"), {
                charIndex: utterance.text.toLowerCase().indexOf("the"),
                name: "word",
              }) as Event & { charIndex: number; name?: string },
            );
          }, 50);
          window.setTimeout(() => {
            utterance.onend?.(new Event("end"));
          }, 420);
        }, 30);
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
    Object.defineProperty(window, "__ttsBoundaryUtteranceIndexes", {
      configurable: true,
      value: boundaryUtteranceIndexes,
      writable: false,
    });
  });

  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedMultiChapterFixturePath);
  await expect(page).toHaveURL(/\/books\//);
  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");
  await page.getByRole("button", { name: /start tts/i }).click();

  const highlightedParagraphs: string[] = [];

  for (const expectedBoundaryCount of [1, 2, 3]) {
    await page.waitForFunction(
      (count) => (window as typeof window & { __ttsBoundaryUtteranceIndexes: number[] }).__ttsBoundaryUtteranceIndexes.length >= count,
      expectedBoundaryCount,
    );

    const { activeParagraph, utteranceText } = await page.evaluate((boundaryCount) => {
      const iframe = document.querySelector(".epub-root iframe") as HTMLIFrameElement | null;
      const active = iframe?.contentDocument?.querySelector(".reader-tts-active-segment");
      const paragraph = active?.closest("p");
      const activeParagraph = paragraph?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const runtimeWindow = window as typeof window & {
        __ttsBoundaryUtteranceIndexes: number[];
        __ttsCalls: Array<{ text: string }>;
      };
      const utteranceIndex = runtimeWindow.__ttsBoundaryUtteranceIndexes[boundaryCount - 1] ?? -1;
      const utteranceText = runtimeWindow.__ttsCalls[utteranceIndex]?.text ?? "";
      return {
        activeParagraph,
        utteranceText,
      };
    }, expectedBoundaryCount);

    const activeLead = activeParagraph.split(/\s+/).slice(0, 8).join(" ");
    expect(activeParagraph).not.toBe("");
    expect(utteranceText).toContain(activeLead);
    highlightedParagraphs.push(activeParagraph);
  }

  expect(new Set(highlightedParagraphs).size).toBe(3);
});
