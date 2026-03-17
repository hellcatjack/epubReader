import { expect, test } from "@playwright/test";

const fixturePath = "tests/fixtures/epub/minimal-valid.epub";

function createSilentWav(durationMs = 750, sampleRate = 24000) {
  const sampleCount = Math.floor((sampleRate * durationMs) / 1000);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

test("pwa registration and kokoro tts states behave correctly", async ({ page }) => {
  let helperWarmed = false;
  let speakRequests = 0;

  await page.route(/http:\/\/127\.0\.0\.1:43115\/health$/, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        backend: "kokoro",
        device: "cuda:0",
        status: helperWarmed ? "ok" : "warming_up",
        version: "0.1.0",
        voiceCount: 4,
        warmed: helperWarmed,
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route(/http:\/\/127\.0\.0\.1:43115\/prewarm$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    helperWarmed = true;
    await route.fulfill({
      body: JSON.stringify({ status: "ok" }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route(/http:\/\/127\.0\.0\.1:43115\/speak$/, async (route) => {
    speakRequests += 1;
    await route.fulfill({
      body: createSilentWav(),
      contentType: "audio/wav",
      status: 200,
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

  await expect(page.getByText(/tts status: warming up model/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /start tts/i })).toBeDisabled();

  await expect(page.getByRole("button", { name: /start tts/i })).toBeEnabled();
  await page.getByRole("button", { name: /start tts/i }).click();

  await expect
    .poll(async () => (await page.getByLabel("TTS queue").locator("p").first().textContent()) ?? "")
    .toContain("playing");
  await expect.poll(() => speakRequests).toBeGreaterThan(0);

  await expect(page.getByRole("button", { name: /read aloud/i })).toBeDisabled();
  await expect(page.locator(".epub-root iframe").first()).toHaveAttribute("sandbox", "allow-same-origin");
});
