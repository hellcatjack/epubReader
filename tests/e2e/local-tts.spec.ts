import { expect, test } from "@playwright/test";
import { selectTextInIframe } from "./helpers/epubSelection";

const fixturePath = "tests/fixtures/epub/minimal-valid.epub";
const paginatedFixturePath = "tests/fixtures/epub/paginated-long.epub";
const paginatedChunkedSentenceFixturePath = "tests/fixtures/epub/paginated-chunked-sentence.epub";
const paginatedMultiChapterFixturePath = "tests/fixtures/epub/paginated-multi-chapter.epub";

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

  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls[0]?.text ?? "",
      ),
    )
    .toContain("Paginated keyboard navigation needs a chapter that genuinely spans multiple screens");
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as typeof window & { __ttsCalls: Array<{ text: string }> }).__ttsCalls[0]?.text ?? "",
      ),
    )
    .not.toContain("The hallway light hummed above the stairwell");
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
  const expectedParagraphs = [
    "Chapter One opens in the archive stairwell where Mara keeps climbing because the envelopes in her coat feel heavier each time the neon light flickers.",
    "Every floor smells faintly different, and she measures the climb by those shifts instead of counting steps because numbers make the building feel more final than she wants it to be tonight.",
    "A brass rail follows her hand upward, cold enough to sting, while the concrete walls hold old rain and dust in the same pale streaks they have worn for years.",
  ];

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

  await page.waitForFunction(
    () => (window as typeof window & { __ttsBoundaryUtteranceIndexes: number[] }).__ttsBoundaryUtteranceIndexes.length >= 1,
  );
  const firstParagraph = await page.evaluate(() => {
    const iframe = document.querySelector(".epub-root iframe") as HTMLIFrameElement | null;
    const active = iframe?.contentDocument?.querySelector(".reader-tts-active-segment");
    const paragraph = active?.closest("p");
    return paragraph?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  });
  expect(firstParagraph).toBe(expectedParagraphs[0]);

  await page.waitForFunction(
    () => (window as typeof window & { __ttsBoundaryUtteranceIndexes: number[] }).__ttsBoundaryUtteranceIndexes.length >= 2,
  );
  const secondParagraph = await page.evaluate(() => {
    const iframe = document.querySelector(".epub-root iframe") as HTMLIFrameElement | null;
    const active = iframe?.contentDocument?.querySelector(".reader-tts-active-segment");
    const paragraph = active?.closest("p");
    return paragraph?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  });
  expect(secondParagraph).toBe(expectedParagraphs[1]);

  await page.waitForFunction(
    () => (window as typeof window & { __ttsBoundaryUtteranceIndexes: number[] }).__ttsBoundaryUtteranceIndexes.length >= 3,
  );
  const thirdParagraph = await page.evaluate(() => {
    const iframe = document.querySelector(".epub-root iframe") as HTMLIFrameElement | null;
    const active = iframe?.contentDocument?.querySelector(".reader-tts-active-segment");
    const paragraph = active?.closest("p");
    return paragraph?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  });
  expect(thirdParagraph).toBe(expectedParagraphs[2]);
});
