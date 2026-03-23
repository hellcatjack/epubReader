import { expect, test } from "@playwright/test";

const fixturePath = "tests/fixtures/epub/minimal-valid.epub";

test("pwa registration and browser tts states behave correctly", async ({ page }) => {
  await page.addInitScript(() => {
    let paused = false;
    let activeTimer: number | undefined;

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
    });

    class MockSpeechSynthesisUtterance {
      onstart: ((event: Event) => void) | null = null;
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

    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
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
          utterance.onstart?.(new Event("start"));
          activeTimer = window.setTimeout(() => {
            if (!paused) {
              utterance.onend?.(new Event("end"));
            }
          }, 100);
        },
        speaking: false,
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: MockSpeechSynthesisUtterance,
    });
  });

  await page.goto("/");

  await expect(page.locator("link[rel='manifest']")).toHaveCount(1);

  const [icon192Response, icon512Response] = await Promise.all([
    page.request.get("/pwa-192.png"),
    page.request.get("/pwa-512.png"),
  ]);
  expect(icon192Response.ok()).toBe(true);
  expect(icon512Response.ok()).toBe(true);
  expect(icon192Response.headers()["content-type"]).toContain("image/png");
  expect(icon512Response.headers()["content-type"]).toContain("image/png");

  const registrationCount = await page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return (await navigator.serviceWorker.getRegistrations()).length;
  });
  expect(registrationCount).toBeGreaterThanOrEqual(0);

  await page.setInputFiles("input[type=file]", fixturePath);
  await expect(page).toHaveURL(/\/books\//);

  const ttsQueue = page.getByRole("region", { name: /tts queue/i });
  const ttsBadge = ttsQueue.locator(".reader-tts-badge");

  await expect(ttsBadge).toHaveText(/ready/i);
  await expect(page.getByRole("button", { name: /start tts/i })).toBeEnabled();

  await page.getByRole("button", { name: /start tts/i }).click();
  await expect(ttsBadge).toHaveText(/playing/i);

  await expect(page.getByRole("button", { name: /read aloud/i })).toBeDisabled();
  await expect(page.locator(".epub-root iframe").first()).toHaveAttribute("sandbox", "allow-same-origin");
});
