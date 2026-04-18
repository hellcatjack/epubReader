import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";

const repoBibleFixturePath =
  "The Holy Bible English Standard Version (ESV) (Crossway Bibles) (z-library.sk, 1lib.sk, z-lib.sk).epub";
const localBibleFixturePath = "tests/fixtures/local/bible-esv.epub";
const bibleFixturePath = process.env.BIBLE_FIXTURE_PATH ??
  (existsSync(localBibleFixturePath) ? localBibleFixturePath : repoBibleFixturePath);

test.skip(!existsSync(bibleFixturePath), `Optional local Bible fixture not available at ${bibleFixturePath}`);

async function importBible(page: Parameters<typeof test>[0]["page"]) {
  await page.goto("/");
  await page.setInputFiles("input[type=file]", bibleFixturePath);
  await expect(page).toHaveURL(/\/books\//);
  await expect(page.getByRole("navigation", { name: /table of contents/i })).toBeVisible();
}

async function waitForBibleChapterToc(page: Parameters<typeof test>[0]["page"]) {
  await expect(page.getByRole("button", { name: /expand genesis/i })).toBeVisible();
}

async function waitForBibleAnchor(page: Parameters<typeof test>[0]["page"], targetId: string) {
  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node, currentTargetId) => Boolean(node.contentDocument?.getElementById(currentTargetId)), targetId),
    )
    .toBe(true);
}

test("Bible reader top bar keeps reading status on a single compact row", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  const topbarMetrics = await page.evaluate(() => {
    const banner = document.querySelector(".reader-topbar");
    const status = document.querySelector(".reader-topbar-status");
    const actions = document.querySelector(".reader-topbar-actions");
    const progress = document.querySelector(".reader-progress");
    const current = document.querySelector(".reader-current-section");

    return {
      actionsTop: actions?.getBoundingClientRect().top ?? null,
      bannerHeight: banner?.getBoundingClientRect().height ?? null,
      currentTop: current?.getBoundingClientRect().top ?? null,
      progressTop: progress?.getBoundingClientRect().top ?? null,
      statusTop: status?.getBoundingClientRect().top ?? null,
    };
  });

  expect(topbarMetrics.bannerHeight).not.toBeNull();
  expect(topbarMetrics.bannerHeight ?? 0).toBeLessThan(140);
  expect(Math.abs((topbarMetrics.progressTop ?? 0) - (topbarMetrics.currentTop ?? 0))).toBeLessThan(20);
});

test("Bible tts skips verse and footnote markers when starting from Genesis 1", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string }> = [];
    let activeTimer: number | undefined;
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
          if (activeTimer) {
            clearTimeout(activeTimer);
            activeTimer = undefined;
          }
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
          calls.push({ text: utterance.text });
          activeTimer = window.setTimeout(() => {
            utterance.onstart?.(new Event("start"));
          }, 10);
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

  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  await waitForBibleChapterToc(page);
  await page.getByRole("button", { name: /expand genesis/i }).click();
  await page.getByRole("button", { name: "Chapter 1", exact: true }).click();
  await waitForBibleAnchor(page, "v01001001");
  await page.getByRole("button", { name: /start tts/i }).click();

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBeGreaterThan(0);

  const firstCall = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls[0]?.text ?? "",
  );

  expect(firstCall).toBe("The Creation of the World.");

  await page.evaluate(() => (window as typeof window & { __finishCurrentTts: () => void }).__finishCurrentTts());

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBeGreaterThan(1);

  const secondCall = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls[1]?.text ?? "",
  );

  expect(secondCall.startsWith("In the beginning, God created the heavens and the earth.")).toBe(true);
  expect(secondCall).not.toMatch(/\b1\s*:\s*1\b/u);
  expect(secondCall).not.toMatch(/\[\d+\]/u);
  expect(secondCall).not.toMatch(/^\d+\b/u);
});

test("Bible tts gives the Genesis 10 title its own utterance before the chapter body", async ({ page }) => {
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
          currentUtterance = utterance;
          calls.push(utterance.text);
          window.setTimeout(() => {
            utterance.onstart?.(new Event("start"));
          }, 10);
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

  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  await waitForBibleChapterToc(page);
  await page.getByRole("button", { name: /expand genesis/i }).click();
  await page.getByRole("button", { name: "Chapter 10", exact: true }).click();
  await waitForBibleAnchor(page, "h00022");
  await page.getByRole("button", { name: /start tts/i }).click();

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls.length))
    .toBeGreaterThan(0);

  const firstCall = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls[0] ?? "",
  );

  expect(firstCall).toBe("Nations Descended from Noah.");

  await page.evaluate(() => (window as typeof window & { __finishCurrentTts: () => void }).__finishCurrentTts());

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls.length))
    .toBeGreaterThan(1);

  const secondCall = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls[1] ?? "",
  );

  expect(secondCall.startsWith("These are the generations of the sons of Noah, Shem, Ham, and Japheth.")).toBe(true);
});

test("Bible scrolled tts leaves an audible pause after the Genesis 10 title before the body", async ({ page }) => {
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
          currentUtterance = utterance;
          calls.push(utterance.text);
          window.setTimeout(() => {
            utterance.onstart?.(new Event("start"));
          }, 10);
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

  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  await page.getByRole("button", { name: /scrolled mode/i }).click();
  await waitForBibleChapterToc(page);
  await page.getByRole("button", { name: /expand genesis/i }).click();
  await page.getByRole("button", { name: "Chapter 10", exact: true }).click();
  await waitForBibleAnchor(page, "h00022");
  await page.getByRole("button", { name: /start tts/i }).click();

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls.length))
    .toBeGreaterThan(0);

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls[0] ?? ""))
    .toBe("Nations Descended from Noah.");

  await page.evaluate(() => (window as typeof window & { __finishCurrentTts: () => void }).__finishCurrentTts());
  await page.waitForTimeout(220);

  const callCountDuringPause = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls.length,
  );
  expect(callCountDuringPause).toBe(1);

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls.length))
    .toBeGreaterThan(1);

  const secondCall = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls[1] ?? "",
  );
  expect(secondCall.startsWith("These are the generations of the sons of Noah, Shem, Ham, and Japheth.")).toBe(true);
});

test("Bible scrolled selection-start tts keeps the Genesis 10 heading pause when crossing from Chapter 9", async ({ page }) => {
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
          currentUtterance = utterance;
          calls.push(utterance.text);
          window.setTimeout(() => {
            utterance.onstart?.(new Event("start"));
          }, 10);
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

  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  await page.getByRole("button", { name: /scrolled mode/i }).click();
  await waitForBibleChapterToc(page);
  await page.getByRole("button", { name: /expand genesis/i }).click();
  await page.getByRole("button", { name: "Chapter 9", exact: true }).click();
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>(".epub-root iframe");
    const doc = iframe?.contentDocument;
    const targetParagraph = Array.from(doc?.querySelectorAll("p") ?? []).find((paragraph) =>
      paragraph.textContent?.includes("All the days of Noah were 950 years, and he died."),
    );

    if (!targetParagraph) {
      throw new Error("missing Genesis 9 ending paragraph");
    }

    targetParagraph.scrollIntoView({ block: "center" });
    const textNode = Array.from(targetParagraph.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes("and he died."),
    );

    if (!textNode || !textNode.textContent) {
      throw new Error("missing target text node");
    }

    const start = textNode.textContent.indexOf("and he died.");
    const range = doc!.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + "and he died.".length);

    const selection = doc!.defaultView?.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });

  await page.getByRole("button", { name: /start tts/i }).click();

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls.length))
    .toBeGreaterThan(0);

  let calls = await page.evaluate(() => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls.slice());
  expect(calls[0] ?? "").toBe("and he died.");

  for (let attempt = 0; attempt < 8 && !calls.includes("Nations Descended from Noah."); attempt += 1) {
    await page.evaluate(() => (window as typeof window & { __finishCurrentTts: () => void }).__finishCurrentTts());
    await page.waitForTimeout(180);
    calls = await page.evaluate(() => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls.slice());
  }

  const headingIndex = calls.indexOf("Nations Descended from Noah.");
  expect(headingIndex).toBeGreaterThanOrEqual(0);

  await page.evaluate(() => (window as typeof window & { __finishCurrentTts: () => void }).__finishCurrentTts());
  await page.waitForTimeout(220);

  const callCountDuringPause = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls.length,
  );
  expect(callCountDuringPause).toBe(headingIndex + 1);

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls.length))
    .toBeGreaterThan(headingIndex + 1);

  const thirdCall = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls.at(-1) ?? "",
  );
  expect(thirdCall.startsWith("These are the generations of the sons of Noah, Shem, Ham, and Japheth.")).toBe(true);
});

test("Bible paginated follow playback keeps Genesis 10 on chapter text instead of drifting into footnotes", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    let activeTimer: number | undefined;
    let activeBoundaryTimer: number | undefined;
    let activeEndTimer: number | undefined;

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
          calls.push(utterance.text);
          activeTimer = window.setTimeout(() => {
            utterance.onstart?.(new Event("start"));
            activeBoundaryTimer = window.setTimeout(() => {
              utterance.onboundary?.({ ...(new Event("boundary")), charIndex: 0 } as Event & { charIndex: number });
            }, 80);
            activeEndTimer = window.setTimeout(() => {
              utterance.onend?.(new Event("end"));
            }, 180);
          }, 40);
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
  });

  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await waitForBibleChapterToc(page);
  await page.getByRole("button", { name: /expand genesis/i }).click();
  await page.getByRole("button", { name: "Chapter 10", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /voice, speed, volume/i }).click();
  await page.getByRole("checkbox", { name: /follow tts playback/i }).check();
  await page.getByRole("button", { name: /start tts/i }).click();

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: string[] }).__ttsCalls.length))
    .toBeGreaterThan(4);

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const iframe = document.querySelector<HTMLIFrameElement>(".epub-root iframe");
        const container = iframe?.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
        const doc = iframe?.contentDocument;
        const currentText =
          document.querySelector(".reader-tts-current p")?.textContent?.replace(/\s+/g, " ").trim() ?? "";

        if (!iframe || !container || !doc || !currentText || container.scrollLeft <= 100) {
          return false;
        }

        const visibleLeft = container.scrollLeft;
        const visibleRight = visibleLeft + container.clientWidth;
        const visibleTexts = Array.from(doc.querySelectorAll("p, li"))
          .map((node) => ({
            rect: node.getBoundingClientRect(),
            text: node.textContent?.replace(/\s+/g, " ").trim() ?? "",
          }))
          .filter(({ rect, text }) => text && rect.right > visibleLeft && rect.left < visibleRight)
          .map(({ text }) => text);

        const currentMatchesVisible = visibleTexts.some(
          (text) => text.includes(currentText.slice(0, 60)) || currentText.includes(text.slice(0, 60)),
        );
        const footnoteVisible = visibleTexts.some((text) => /^\[\d+\]\s*\d+:\d+/.test(text));
        return currentMatchesVisible && !footnoteVisible;
      }),
    )
    .toBe(true);
});

test("Bible scrolled mode start tts continues from a selected Genesis 10 phrase instead of jumping to chapter start", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const calls: Array<{ text: string }> = [];
    let activeTimer: number | undefined;

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
          if (activeTimer) {
            clearTimeout(activeTimer);
            activeTimer = undefined;
          }
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
          calls.push({ text: utterance.text });
          activeTimer = window.setTimeout(() => {
            utterance.onstart?.(new Event("start"));
          }, 10);
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
  });

  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  await waitForBibleChapterToc(page);
  await page.getByRole("button", { name: /expand genesis/i }).click();
  await page.getByRole("button", { name: "Chapter 10", exact: true }).click();
  await page.waitForTimeout(800);

  const frameHandle = await page.locator(".epub-root iframe").first().elementHandle();
  const frame = await frameHandle?.contentFrame();
  expect(frame).toBeTruthy();

  const selectionText = await frame!.evaluate(() => {
    const target = "the sons of Noah";
    const frameElement = window.frameElement as HTMLIFrameElement | null;
    const container = frameElement?.ownerDocument
      ?.querySelector<HTMLElement>(".epub-root .epub-container");
    const viewportTop = container?.scrollTop ?? 0;
    const viewportBottom = viewportTop + (frameElement?.clientHeight ?? window.innerHeight);
    const candidates = Array.from(document.querySelectorAll("p"));

    for (const paragraph of candidates) {
      const rect = paragraph.getBoundingClientRect();
      if (rect.bottom <= viewportTop || rect.top >= viewportBottom) {
        continue;
      }

      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      let node: Node | null = null;

      while ((node = walker.nextNode())) {
        const text = node.textContent || "";
        const index = text.indexOf(target);
        if (index < 0) {
          continue;
        }

        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + target.length);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
        return selection?.toString().replace(/\s+/g, " ").trim() || "";
      }
    }

    return "";
  });

  expect(selectionText).toBe("the sons of Noah");

  await page.waitForTimeout(300);
  await page.evaluate(() => {
    (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length = 0;
  });
  await page.getByRole("button", { name: /start tts/i }).click();
  await page.waitForTimeout(800);

  const firstCall = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls[0]?.text ?? "",
  );

  expect(firstCall.startsWith(selectionText)).toBe(true);
  expect(firstCall).toContain("Shem, Ham, and Japheth. Sons were born to them after the flood.");
  expect(firstCall).not.toContain("These are the generations of the sons of Noah");
});

test("scrolling the Bible toc keeps the reading workspace pinned to the first screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  const before = await page.evaluate(() => ({
    readerTop: document.querySelector(".reader-center")?.getBoundingClientRect().top ?? null,
    scrollY: window.scrollY,
  }));

  await page.getByRole("navigation", { name: /table of contents/i }).hover();
  await page.mouse.wheel(0, 2400);

  const after = await page.evaluate(() => ({
    readerTop: document.querySelector(".reader-center")?.getBoundingClientRect().top ?? null,
    scrollY: window.scrollY,
  }));

  expect(after.scrollY).toBe(0);
  expect(after.readerTop).toBe(before.readerTop);
});

test("Bible toc chapter navigation lands on the requested Genesis chapter anchor", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  await waitForBibleChapterToc(page);
  await page.getByRole("button", { name: /expand genesis/i }).click();
  await page.getByRole("button", { name: "Chapter 1", exact: true }).click();

  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => {
        const doc = node.contentDocument;
        const target = doc?.getElementById("v01001001");
        const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
        return {
          containerScrollTop: container?.scrollTop ?? 0,
          targetTop: target?.getBoundingClientRect().top ?? null,
        };
      }),
    )
    .toEqual(
      expect.objectContaining({
        containerScrollTop: expect.any(Number),
        targetTop: expect.any(Number),
      }),
    );

  const metrics = await page.locator(".epub-root iframe").evaluate((node) => {
    const doc = node.contentDocument;
    const target = doc?.getElementById("v01001001");
    const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
    const targetText = target?.parentElement?.textContent?.replace(/\s+/g, " ").trim() ?? "";

    return {
      containerScrollTop: container?.scrollTop ?? 0,
      targetTop: target?.getBoundingClientRect().top ?? null,
      targetText,
    };
  });

  expect(metrics.containerScrollTop).toBeGreaterThan(100);
  expect(metrics.targetTop).not.toBeNull();
  expect(Math.abs((metrics.targetTop ?? 0) - metrics.containerScrollTop)).toBeLessThan(80);
  expect(metrics.targetText).toContain("In the beginning, God created the heavens and the earth.");
});

test("Bible toc chapter navigation opens Genesis 10 instead of falling back to the Genesis contents page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  await waitForBibleChapterToc(page);
  await page.getByRole("button", { name: /expand genesis/i }).click();
  await page.getByRole("button", { name: "Chapter 10", exact: true }).click();
  await page.waitForTimeout(1200);

  const currentSection = (await page.getByLabel("Current section").textContent())?.replace(/\s+/g, " ").trim() ?? "";
  const chapterHeadingVisible = await page.locator(".epub-root iframe").evaluate((node) => {
    const iframe = node;
    const root = iframe.closest(".epub-root");
    const container = root?.querySelector<HTMLElement>(".epub-container");
    const viewportLeft = container?.scrollLeft ?? 0;
    const viewportWidth = root?.clientWidth ?? 0;
    const heading = iframe.contentDocument?.getElementById("h00022");
    if (!heading) {
      return false;
    }

    const rect = heading.getBoundingClientRect();
    return rect.right > viewportLeft && rect.left < viewportLeft + viewportWidth;
  });

  expect(currentSection).toContain("GENESIS / Chapter 10");
  expect(chapterHeadingVisible).toBe(true);
});

test("Bible scrolled mode preserves the Genesis 10 viewport position across refresh", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  await waitForBibleChapterToc(page);
  await page.getByRole("button", { name: /expand genesis/i }).click();
  await page.getByRole("button", { name: "Chapter 10", exact: true }).click();
  await page.waitForTimeout(1200);

  const readViewportAnchor = async () =>
    page.locator(".epub-root iframe").evaluate((node) => {
      const iframe = node;
      const root = iframe.closest(".epub-root");
      const container = root?.querySelector<HTMLElement>(".epub-container");
      const viewportTop = container?.scrollTop ?? 0;
      const viewportBottom = viewportTop + (root?.clientHeight ?? 0);
      const candidates = Array.from(iframe.contentDocument?.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, p") ?? []);
      const anchor = candidates
        .map((element) => ({
          tag: element.tagName,
          text: (element.textContent || "").replace(/\s+/g, " ").trim(),
          top: element.getBoundingClientRect().top,
          bottom: element.getBoundingClientRect().bottom,
        }))
        .find((element) => element.bottom > viewportTop && element.top < viewportBottom);

      return anchor
        ? {
            relativeTop: anchor.top - viewportTop,
            scrollTop: viewportTop,
            tag: anchor.tag,
            text: anchor.text,
          }
        : null;
    });

  const before = await readViewportAnchor();
  expect(before?.text).toContain("These are the generations of the sons of Noah");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const after = await readViewportAnchor();
  expect(after?.tag).toBe(before?.tag);
  expect(after?.text).toBe(before?.text);
  expect(Math.abs((after?.relativeTop ?? 0) - (before?.relativeTop ?? 0))).toBeLessThan(8);
  expect(Math.abs((after?.scrollTop ?? 0) - (before?.scrollTop ?? 0))).toBeLessThan(8);
});

test("Bible refresh keeps the Genesis chapter branch after delayed toc hydration", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  await waitForBibleChapterToc(page);
  await page.getByRole("button", { name: /expand genesis/i }).click();
  await page.getByRole("button", { name: "Chapter 10", exact: true }).click();
  await waitForBibleAnchor(page, "h00022");

  await expect(page.locator(".reader-current-section")).toContainText("GENESIS / Chapter 10");

  await page.reload({ waitUntil: "networkidle" });

  await expect
    .poll(async () => (await page.locator(".reader-current-section").textContent())?.replace(/\s+/g, " ").trim() ?? "", {
      timeout: 15000,
    })
    .toContain("GENESIS / Chapter 10");

  await expect(page.getByRole("button", { name: /collapse genesis/i })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: "Chapter 10", exact: true })).toBeVisible();
});

test("Bible refresh does not turn Table of Contents into an expandable branch", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  await waitForBibleChapterToc(page);
  await page.getByRole("button", { name: /expand genesis/i }).click();
  await page.getByRole("button", { name: "Chapter 10", exact: true }).click();
  await waitForBibleAnchor(page, "h00022");

  await expect(page.getByRole("button", { name: /expand table of contents/i })).toHaveCount(0);

  await page.reload({ waitUntil: "networkidle" });

  await expect(page.getByRole("button", { name: /expand table of contents/i })).toHaveCount(0);
  await page.waitForTimeout(12000);
  await expect(page.getByRole("button", { name: /expand table of contents/i })).toHaveCount(0);
});

test("Bible paginated mode keeps the Genesis chapter branch after delayed relocation updates", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  await waitForBibleChapterToc(page);
  await page.getByRole("button", { name: /expand genesis/i }).click();
  await page.getByRole("button", { name: "Chapter 10", exact: true }).click();
  await waitForBibleAnchor(page, "h00022");

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await page.waitForTimeout(12000);

  await expect(page.locator(".reader-current-section")).toContainText("GENESIS / Chapter 10");
  await expect(page.getByRole("button", { name: /collapse genesis/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Chapter 10", exact: true })).toBeVisible();
});

test("Bible mode toggles keep Genesis 10 anchored instead of jumping back to the Genesis contents page", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  await waitForBibleChapterToc(page);
  await page.getByRole("button", { name: /expand genesis/i }).click();
  await page.getByRole("button", { name: "Chapter 10", exact: true }).click();
  await page.waitForTimeout(1200);

  const readVisibleSamples = async () =>
    page.locator(".epub-root iframe").evaluate((node) => {
      const iframe = node;
      const root = iframe.closest(".epub-root");
      const container = root?.querySelector<HTMLElement>(".epub-container");
      const mode = root?.getAttribute("data-reader-mode") ?? "scrolled";
      const viewportLeft = mode === "paginated" ? container?.scrollLeft ?? 0 : 0;
      const viewportTop = mode === "scrolled" ? container?.scrollTop ?? 0 : 0;
      const points = [
        { name: "topHeading", x: viewportLeft + 80, y: viewportTop + 80 },
        { name: "topSentence", x: viewportLeft + 120, y: viewportTop + 140 },
      ];
      const textAtPoint = (x: number, y: number) => {
        const range = iframe.contentDocument?.caretRangeFromPoint?.(x, y);
        const pointNode = range?.startContainer;
        const value = pointNode?.textContent || pointNode?.parentElement?.textContent || "";
        return value.replace(/\s+/g, " ").trim();
      };

      return {
        mode,
        samples: points.map((point) => ({
          name: point.name,
          text: textAtPoint(point.x, point.y),
        })),
      };
    });

  const initial = await readVisibleSamples();

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await page.waitForTimeout(1200);
  const afterFirstPaginated = await readVisibleSamples();

  await page.getByRole("button", { name: /scrolled mode/i }).click();
  await page.waitForTimeout(1200);
  const afterScrolled = await readVisibleSamples();

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await page.waitForTimeout(1200);
  const afterSecondPaginated = await readVisibleSamples();

  expect(initial?.mode).toBe("scrolled");
  expect(afterFirstPaginated?.mode).toBe("paginated");
  expect(afterScrolled?.mode).toBe("scrolled");
  expect(afterSecondPaginated?.mode).toBe("paginated");
  expect(afterFirstPaginated?.samples[0]?.text).toContain("Nations Descended from Noah");
  expect(afterFirstPaginated?.samples[1]?.text).toContain("These are the generations of the sons of Noah");
  expect(afterSecondPaginated?.samples[0]?.text).toContain("Nations Descended from Noah");
  expect(afterSecondPaginated?.samples[1]?.text).toContain("These are the generations of the sons of Noah");
  expect(pageErrors).toEqual([]);
});
