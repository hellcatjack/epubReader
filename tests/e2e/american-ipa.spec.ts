import { expect, test } from "@playwright/test";

test("bundled American pronunciations remain available offline after loading a letter", async ({ page, context }) => {
  const externalDictionaryRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("dictionaryapi.dev")) externalDictionaryRequests.push(request.url());
  });
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const online = await page.evaluate(async () => {
    const data = await (await fetch("/phonetics/en-US/v1/b.json")).json();
    const alternatives = await (await fetch("/phonetics/en-US/v1/r.json")).json();
    return { babylon: data.babylon, read: alternatives.read };
  });
  expect(online.babylon).toBe("/ˈbæbəˌɫɑn/");
  expect(online.read).toBe("/ˈɹɛd/, /ˈɹid/");
  await expect.poll(() => page.evaluate(async () => Boolean(await (await caches.open("american-ipa-v1")).match("/phonetics/en-US/v1/b.json")))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  const offline = await page.evaluate(async () => (await (await fetch("/phonetics/en-US/v1/b.json")).json()).babylon);
  expect(offline).toBe(online.babylon);
  expect(externalDictionaryRequests).toEqual([]);
});

test("selected words display real local American IPA even when translation is unavailable", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("input[type=file]", "tests/fixtures/epub/minimal-valid.epub");
  await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>(".epub-root iframe")?.contentDocument?.querySelector("p")?.textContent?.includes("Hello"));
  // Allow the initial rendition navigation to settle before selecting.
  await page.waitForTimeout(1500);
  await page.locator(".epub-root iframe").first().evaluate((frame: HTMLIFrameElement) => {
    const doc = frame.contentDocument!;
    const node = doc.querySelector("p")!.firstChild!;
    const range = doc.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 5);
    const selection = frame.contentWindow!.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    doc.dispatchEvent(new Event("selectionchange"));
    frame.contentWindow!.dispatchEvent(new Event("mouseup"));
  });
  await expect(page.locator(".reader-ai-meta")).toContainText("American IPA");
  await expect(page.locator(".reader-ai-meta")).toContainText("/həˈɫoʊ/, /hɛˈɫoʊ/");
});
