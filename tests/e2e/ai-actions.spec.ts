import { expect, test, type Page } from "@playwright/test";
import { selectTextInIframe } from "./helpers/epubSelection";

const fixturePath = "tests/fixtures/epub/minimal-valid.epub";

async function selectWordCountInIframe(page: Page, count: number) {
  await page.waitForFunction((nextCount) => {
    const frame = document.querySelector<HTMLIFrameElement>(".epub-root iframe");
    const doc = frame?.contentDocument;
    const paragraph = doc?.querySelector("p");
    const text = paragraph?.textContent?.trim() ?? "";
    const words = [...text.matchAll(/[A-Za-z]+(?:['-][A-Za-z]+)*/g)];
    return words.length >= nextCount;
  }, count);

  return await page.locator(".epub-root iframe").evaluateAll((frames, nextCount) => {
    const wordPattern = /[A-Za-z]+(?:['-][A-Za-z]+)*/g;

    for (const frame of frames) {
      const doc = frame.contentDocument;
      const paragraph = doc?.querySelector("p");
      const textNode = paragraph?.firstChild;
      const text = textNode?.textContent ?? "";
      const words = [...text.matchAll(wordPattern)];

      if (!doc || !paragraph || !textNode || words.length < nextCount) {
        continue;
      }

      const start = words[0]?.index ?? 0;
      const endMatch = words[nextCount - 1];
      if (endMatch?.index == null) {
        continue;
      }

      const end = endMatch.index + endMatch[0].length;
      const range = doc.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      const selection = frame.contentWindow?.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      doc.dispatchEvent(new Event("selectionchange"));
      frame.contentWindow?.dispatchEvent(new Event("mouseup"));
      return text.slice(start, end);
    }

    return "";
  }, count);
}

test("ai actions translate explain and save a note for selected text", async ({ page }) => {
  const requestPrompts: string[] = [];

  await page.route("http://localhost:8001/v1/completions", async (route) => {
    const body = route.request().postDataJSON();
    const prompt = typeof body.prompt === "string" ? body.prompt : JSON.stringify(body);
    requestPrompts.push(prompt);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ text: "中文翻译" }],
      }),
    });
  });
  await page.route("http://localhost:8001/v1/chat/completions", async (route) => {
    const body = route.request().postDataJSON();
    const prompt = JSON.stringify(body);
    requestPrompts.push(prompt);
    const content = prompt.includes("Reply only in English") ? "English explanation" : "中文解释";

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content } }],
      }),
    });
  });
  await page.route("https://api.dictionaryapi.dev/api/v2/entries/en/*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ phonetics: [{ text: "/ipa/" }] }]),
    });
  });

  await page.goto("/");
  await page.setInputFiles("input[type=file]", fixturePath);
  await expect(page).toHaveURL(/\/books\//);
  const topbar = page.getByRole("banner");
  await expect(topbar.getByRole("button", { name: "Translate" })).toBeVisible();
  await expect(topbar.getByRole("button", { name: "Explain" })).toBeVisible();
  await expect(topbar.getByRole("button", { name: "Highlight" })).toBeVisible();
  await expect(topbar.getByRole("button", { name: "Add note" })).toBeVisible();
  await expect(topbar.getByRole("button", { name: "Read aloud" })).toBeVisible();

  const selectedWord = await selectWordCountInIframe(page, 1);
  expect(selectedWord.length).toBeGreaterThan(0);
  const aiMeta = page.locator(".reader-ai-meta");
  const translationSurface = page.locator(".reader-ai-surface-primary");
  const explanationSurface = page.locator(".reader-ai-surface-secondary");
  await expect(aiMeta).toBeVisible();
  await expect(translationSurface).toBeVisible();
  await expect(explanationSurface).toBeVisible();
  await expect(aiMeta).toContainText("Selection");
  await expect(aiMeta).toContainText(selectedWord);
  await expect(aiMeta).toContainText("IPA");
  await expect(aiMeta).toContainText("/ipa/");
  await expect(translationSurface).toContainText("中文翻译");
  await expect(explanationSurface).toContainText("Click Explain for deeper context.");

  const selectedPhrase = await selectWordCountInIframe(page, 2);
  expect(selectedPhrase.split(/\s+/).length).toBe(2);
  await expect(aiMeta).toContainText(selectedPhrase);
  await expect(aiMeta).not.toContainText("/ipa/");

  const selected = await selectTextInIframe(page);
  expect(selected.length).toBeGreaterThan(0);

  await expect(translationSurface).toContainText("中文翻译");

  await page.getByRole("button", { name: "Explain" }).click();
  await expect(translationSurface).toContainText("中文翻译");
  await expect(explanationSurface).toContainText("中文解释");
  await expect(explanationSurface).toContainText("English explanation");
  await expect(explanationSurface).not.toContainText("Click Explain for deeper context.");
  expect(requestPrompts.some((prompt) => prompt.includes("Simplified Chinese"))).toBe(true);
  expect(requestPrompts.some((prompt) => prompt.includes("Reply only in Simplified Chinese"))).toBe(true);
  expect(requestPrompts.some((prompt) => prompt.includes("Reply only in English"))).toBe(true);

  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByRole("textbox", { name: /note body/i }).fill("Remember this sentence");
  await page.getByRole("button", { name: /save note/i }).click();
  await expect(page.getByLabel("Saved notes")).toContainText("Remember this sentence");
});
