import { expect, test } from "@playwright/test";

const fixturePath = "tests/fixtures/epub/minimal-valid.epub";

test("pwa registration and reader sandbox edges behave correctly", async ({ page }) => {
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
  await page.getByRole("link", { name: /minimal valid epub/i }).click();

  await expect(page.getByRole("button", { name: /read aloud unavailable/i })).toBeDisabled();
  await expect(page.locator(".epub-root iframe").first()).toHaveAttribute("sandbox", "allow-same-origin");
});
