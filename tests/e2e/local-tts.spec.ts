import { expect, test } from "@playwright/test";
import { selectTextInIframe } from "./helpers/epubSelection";

const fixturePath = "tests/fixtures/epub/minimal-valid.epub";
const minimalWave = Buffer.from([
  82, 73, 70, 70, 38, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0, 68, 172,
  0, 0, 136, 88, 1, 0, 2, 0, 16, 0, 100, 97, 116, 97, 2, 0, 0, 0, 0, 0,
]);

test("local helper tts supports selection playback and continuous reader controls", async ({ page }) => {
  const speakRequests: Array<{ text: string; voiceId: string }> = [];

  await page.addInitScript(() => {
    const timers = new WeakMap<HTMLMediaElement, number>();

    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function play() {
        this.dataset.mockPaused = "false";
        const timer = window.setTimeout(() => {
          if (this.dataset.mockPaused !== "true") {
            this.dispatchEvent(new Event("ended"));
          }
        }, 1000);
        timers.set(this, timer);
        return Promise.resolve();
      },
    });

    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: function pause() {
        this.dataset.mockPaused = "true";
        const timer = timers.get(this);
        if (timer) {
          window.clearTimeout(timer);
        }
      },
    });

    Object.defineProperty(HTMLMediaElement.prototype, "load", {
      configurable: true,
      value: function load() {
        return undefined;
      },
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

  await page.route("http://127.0.0.1:43115/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        backend: "kokoro",
        device: "cuda:0",
        status: "ok",
        version: "0.1.0",
        voiceCount: 1,
        warmed: true,
      }),
    });
  });

  await page.route("http://127.0.0.1:43115/voices", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "af_heart",
          displayName: "Heart",
          gender: "female",
          isDefault: true,
          locale: "en-US",
        },
      ]),
    });
  });

  await page.route("http://127.0.0.1:43115/prewarm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok" }),
    });
  });

  await page.route("http://127.0.0.1:43115/speak", async (route) => {
    const body = route.request().postDataJSON() as { text: string; voiceId: string };
    speakRequests.push({ text: body.text, voiceId: body.voiceId });
    await route.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: minimalWave,
    });
  });

  await page.goto("/");
  await page.setInputFiles("input[type=file]", fixturePath);
  await expect(page).toHaveURL(/\/books\//);

  const selectedText = await selectTextInIframe(page);
  expect(selectedText.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: /read aloud/i }).click();
  await expect.poll(() => speakRequests.length).toBe(1);
  expect(speakRequests[0]?.text).toContain(selectedText);
  expect(speakRequests[0]?.voiceId).toBe("af_heart");

  await page.getByRole("button", { name: /start tts/i }).click();
  await expect(page.getByText(/tts status: playing/i)).toBeVisible();
  await expect.poll(() => speakRequests.length).toBeGreaterThan(1);
  expect(speakRequests[1]?.voiceId).toBe("af_heart");

  await page.getByRole("button", { name: /pause tts/i }).click();
  await expect(page.getByText(/tts status: paused/i)).toBeVisible();

  await page.getByRole("button", { name: /resume tts/i }).click();
  await expect(page.getByText(/tts status: playing/i)).toBeVisible();

  await page.getByRole("button", { name: /stop tts/i }).click();
  await expect(page.getByText(/tts status: idle/i)).toBeVisible();
});
