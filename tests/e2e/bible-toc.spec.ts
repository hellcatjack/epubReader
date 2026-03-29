import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";

const bibleFixturePath = process.env.BIBLE_FIXTURE_PATH ?? "tests/fixtures/local/bible-esv.epub";

test.skip(!existsSync(bibleFixturePath), `Optional local Bible fixture not available at ${bibleFixturePath}`);

async function importBible(page: Parameters<typeof test>[0]["page"]) {
  await page.goto("/");
  await page.setInputFiles("input[type=file]", bibleFixturePath);
  await expect(page).toHaveURL(/\/books\//);
  await expect(page.getByRole("navigation", { name: /table of contents/i })).toBeVisible();
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

  await page.getByRole("button", { name: /expand genesis/i }).click();
  await page.getByRole("button", { name: "Chapter 1", exact: true }).click();
  await page.getByRole("button", { name: /start tts/i }).click();

  await expect
    .poll(async () => page.evaluate(() => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls.length))
    .toBeGreaterThan(0);

  const firstCall = await page.evaluate(
    () => (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls[0]?.text ?? "",
  );

  expect(firstCall.startsWith("In the beginning, God created the heavens and the earth.")).toBe(true);
  expect(firstCall).not.toMatch(/\b1\s*:\s*1\b/u);
  expect(firstCall).not.toMatch(/\[\d+\]/u);
  expect(firstCall).not.toMatch(/^\d+\b/u);
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

test("Bible mode toggles keep Genesis 10 anchored instead of jumping back to the Genesis contents page", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

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
