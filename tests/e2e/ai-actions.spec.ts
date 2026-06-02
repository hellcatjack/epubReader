import { existsSync, mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { selectTextInIframe } from "./helpers/epubSelection";

const fixturePath = "tests/fixtures/epub/minimal-valid.epub";
const bibleFixturePath = "bible.epub";
const gatewayScreenshotDir = ".codex-gateway-artifacts/screenshots";

async function selectWordCountInIframe(page: Page, count: number) {
  await page.waitForFunction((nextCount) => {
    const frames = Array.from(document.querySelectorAll<HTMLIFrameElement>(".epub-root iframe"));
    return frames.some((frame) => {
      const doc = frame.contentDocument;
      const paragraphs = Array.from(doc?.querySelectorAll("p") ?? []);
      return paragraphs.some((paragraph) => {
        const text = paragraph.textContent?.trim() ?? "";
        const words = [...text.matchAll(/[A-Za-z]+(?:['-][A-Za-z]+)*/g)];
        return words.length >= nextCount;
      });
    });
  }, count);

  return await page.locator(".epub-root iframe").evaluateAll((frames, nextCount) => {
    const wordPattern = /[A-Za-z]+(?:['-][A-Za-z]+)*/g;

    for (const frame of frames) {
      const doc = frame.contentDocument;
      const paragraphs = Array.from(doc?.querySelectorAll("p") ?? []);
      if (!doc) {
        continue;
      }

      for (const paragraph of paragraphs) {
        const textNodes: Text[] = [];
        const walker = doc.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        let fullText = "";

        while (textNode) {
          const node = textNode as Text;
          textNodes.push(node);
          fullText += node.textContent ?? "";
          textNode = walker.nextNode();
        }

        const words = [...fullText.matchAll(wordPattern)];
        if (words.length < nextCount) {
          continue;
        }

        const start = words[0]?.index ?? 0;
        const endMatch = words[nextCount - 1];
        if (endMatch?.index == null) {
          continue;
        }

        const end = endMatch.index + endMatch[0].length;
        let currentOffset = 0;
        let startNode: Text | null = null;
        let startOffset = 0;
        let endNode: Text | null = null;
        let endOffset = 0;

        for (const node of textNodes) {
          const nodeText = node.textContent ?? "";
          const nextOffset = currentOffset + nodeText.length;

          if (!startNode && start >= currentOffset && start <= nextOffset) {
            startNode = node;
            startOffset = start - currentOffset;
          }

          if (!endNode && end >= currentOffset && end <= nextOffset) {
            endNode = node;
            endOffset = end - currentOffset;
          }

          currentOffset = nextOffset;
        }

        if (!startNode || !endNode) {
          continue;
        }

        const range = doc.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        const selection = frame.contentWindow?.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        doc.dispatchEvent(new Event("selectionchange"));
        frame.contentWindow?.dispatchEvent(new Event("mouseup"));
        return words
          .slice(0, nextCount)
          .map((word) => word[0])
          .join(" ");
      }
    }

    return "";
  }, count);
}

async function startDragInIframe(page: Page) {
  await page.locator(".epub-root iframe").evaluateAll((frames) => {
    for (const frame of frames) {
      const doc = frame.contentDocument;
      const paragraph = doc?.querySelector("p");
      paragraph?.dispatchEvent(new Event("mousedown", { bubbles: true }));
      frame.contentWindow?.dispatchEvent(new Event("mousedown"));
    }
  });
}

test("ai actions translate and explain selected text", async ({ page }) => {
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
    await page.waitForTimeout(120);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content: "中文语法解析" } }],
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
  await expect(topbar.getByRole("button", { name: "Highlight" })).toHaveCount(0);
  await expect(topbar.getByRole("button", { name: "Add note" })).toHaveCount(0);
  await expect(topbar.getByRole("button", { name: "Read aloud" })).toBeVisible();

  const selectedWord = await selectWordCountInIframe(page, 1);
  expect(selectedWord.length).toBeGreaterThan(0);
  const aiMeta = page.locator(".reader-ai-meta");
  const translationSurface = page.locator(".reader-ai-surface-primary");
  await expect(aiMeta).toBeVisible();
  await expect(translationSurface).toBeVisible();
  await expect(aiMeta).toContainText("Selection");
  await expect(aiMeta).toContainText(selectedWord);
  await expect(aiMeta).toContainText("IPA");
  await expect(aiMeta).toContainText("/ipa/");
  const ipaLabelBox = await aiMeta.locator(".reader-ai-meta-row").nth(1).locator(".reader-ai-label").boundingBox();
  const ipaValueBox = await aiMeta.locator(".reader-ai-meta-row").nth(1).locator(".reader-ai-value").boundingBox();
  expect(Math.abs((ipaValueBox?.x ?? 0) - (ipaLabelBox?.x ?? 0))).toBeLessThanOrEqual(8);
  await expect(translationSurface).toContainText("中文翻译");
  await expect(page.getByText("Explanation")).toHaveCount(0);

  const selectedPhrase = await selectWordCountInIframe(page, 2);
  expect(selectedPhrase.split(/\s+/).length).toBe(2);
  await expect(aiMeta).toContainText(selectedPhrase);
  await expect(aiMeta).not.toContainText("/ipa/");
  await expect(translationSurface).not.toContainText("中文翻译");
  const desktopBubble = page.getByRole("status", { name: "Selection translation" });
  await expect(desktopBubble).toContainText("中文翻译");
  await expect(desktopBubble).not.toContainText(selectedPhrase);

  const selected = await selectTextInIframe(page);
  expect(selected.length).toBeGreaterThan(0);

  await expect(translationSurface).not.toContainText("中文翻译");
  await expect(desktopBubble).toContainText("中文翻译");

  await page.getByRole("button", { name: "Explain" }).click();
  const grammarPopup = page.getByRole("dialog", { name: "Grammar explanation" });
  await expect(grammarPopup).toBeVisible();
  await expect(grammarPopup).toContainText("正在解析语法...");
  await expect(translationSurface).not.toContainText("中文翻译");
  await expect(grammarPopup).toContainText("中文语法解析");

  await grammarPopup.getByRole("button", { name: /close grammar explanation/i }).click();
  await expect(grammarPopup).toHaveCount(0);
});

test("tablet-sized viewports show a persistent translation bubble for multi-word selections", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1366 });

  await page.route("http://localhost:8001/v1/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ text: "中文翻译" }],
      }),
    });
  });
  await page.route("http://localhost:8001/v1/chat/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content: "中文解释" } }],
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

  const selectedPhrase = await selectWordCountInIframe(page, 2);
  expect(selectedPhrase.split(/\s+/).length).toBe(2);

  const bubble = page.getByRole("status", { name: "Selection translation" });
  await expect(bubble).toContainText("中文翻译");
  await expect(bubble).not.toContainText(selectedPhrase);
  await page.waitForTimeout(3200);
  await expect(bubble).toBeVisible();
});

test("tablet-sized viewports also show a translation bubble for single-word selections", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1366 });

  await page.route("http://localhost:8001/v1/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ text: "中文翻译" }],
      }),
    });
  });
  await page.route("http://localhost:8001/v1/chat/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content: "中文解释" } }],
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

  const selectedWord = await selectWordCountInIframe(page, 1);
  expect(selectedWord.length).toBeGreaterThan(0);

  const bubble = page.getByRole("status", { name: "Selection translation" });
  await expect(bubble).toContainText("中文翻译");
  await expect(bubble).not.toContainText(selectedWord);
});

test("tablet-sized viewports dismiss the previous translation bubble as soon as a new drag selection starts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 1366 });

  await page.route("http://localhost:8001/v1/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ text: "中文翻译" }],
      }),
    });
  });
  await page.route("http://localhost:8001/v1/chat/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content: "中文解释" } }],
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

  await selectWordCountInIframe(page, 2);

  const bubble = page.getByRole("status", { name: "Selection translation" });
  await expect(bubble).toContainText("中文翻译");

  await startDragInIframe(page);

  await expect(bubble).toHaveCount(0);
});

test("clicking the translation bubble dismisses it", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1366 });

  await page.route("http://localhost:8001/v1/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ text: "中文翻译" }],
      }),
    });
  });
  await page.route("http://localhost:8001/v1/chat/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content: "中文解释" } }],
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

  await selectWordCountInIframe(page, 1);

  const bubble = page.getByRole("status", { name: "Selection translation" });
  await expect(bubble).toContainText("中文翻译");

  await bubble.click();

  await expect(bubble).toHaveCount(0);
});

test("resizing an already translated desktop multi-word selection into tablet mode keeps its translation bubble visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });

  await page.route("http://localhost:8001/v1/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ text: "迁移后的翻译" }],
      }),
    });
  });
  await page.route("http://localhost:8001/v1/chat/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content: "中文解释" } }],
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

  const selectedPhrase = await selectWordCountInIframe(page, 2);
  expect(selectedPhrase.split(/\s+/).length).toBe(2);
  await expect(page.locator(".reader-ai-surface-primary")).not.toContainText("迁移后的翻译");
  await expect(page.getByRole("status", { name: "Selection translation" })).toContainText("迁移后的翻译");

  await page.setViewportSize({ width: 1024, height: 1366 });
  await page.waitForTimeout(300);

  await expect(page.getByRole("status", { name: "Selection translation" })).toContainText("迁移后的翻译");
});

test("Bible selection translation bubble renders at 600px on desktop @gateway-screenshot", async ({ page }) => {
  test.skip(!existsSync(bibleFixturePath), `Gateway Bible fixture not available at ${bibleFixturePath}`);

  await page.setViewportSize({ width: 1440, height: 1100 });

  await page.route("http://localhost:8001/v1/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ text: "中文翻译" }],
      }),
    });
  });
  await page.route("http://localhost:8001/v1/chat/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content: "中文解释" } }],
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
  await page.setInputFiles("input[type=file]", bibleFixturePath);
  await expect(page).toHaveURL(/\/books\//);
  await page.getByRole("button", { name: /expand 1 kings/i }).click();
  await page.getByRole("button", { name: "Chapter 3", exact: true }).click();
  await expect(page.locator(".epub-root iframe")).toHaveCount(1);

  const selectedPhrase = await selectWordCountInIframe(page, 2);
  expect(selectedPhrase.split(/\s+/).length).toBe(2);

  const bubble = page.getByRole("status", { name: "Selection translation" });
  await expect(bubble).toContainText("中文翻译");
  await expect(bubble).toBeVisible();

  const bubbleBox = await bubble.boundingBox();
  expect(bubbleBox).not.toBeNull();
  expect(Math.round(bubbleBox!.width)).toBe(600);

  mkdirSync(gatewayScreenshotDir, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: `${gatewayScreenshotDir}/bible-selection-translation-bubble-600px.png`,
  });
});
