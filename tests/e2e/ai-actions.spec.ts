import { expect, test } from "@playwright/test";
import { selectTextInIframe } from "./helpers/epubSelection";

const fixturePath = "tests/fixtures/epub/minimal-valid.epub";

test("ai actions translate explain and save a note for selected text", async ({ page }) => {
  const requestPrompts: string[] = [];

  await page.route("http://192.168.1.31:8001/v1/chat/completions", async (route) => {
    const body = route.request().postDataJSON();
    const prompt = JSON.stringify(body);
    requestPrompts.push(prompt);
    const content = prompt.includes("Reply only in English")
      ? "English explanation"
      : prompt.includes("Explain the following reading selection")
        ? "中文解释"
        : "中文翻译";

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content } }],
      }),
    });
  });

  await page.goto("/");
  await page.setInputFiles("input[type=file]", fixturePath);
  await expect(page).toHaveURL(/\/books\//);

  const selected = await selectTextInIframe(page);
  expect(selected.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Translate" }).click();
  await expect(page.getByLabel("AI result")).toContainText("中文翻译");

  await page.getByRole("button", { name: "Explain" }).click();
  await expect(page.getByLabel("AI result")).toContainText("中文解释");
  await expect(page.getByLabel("AI result")).toContainText("English explanation");
  expect(requestPrompts[0]).toContain("Simplified Chinese");
  expect(requestPrompts[1]).toContain("Reply only in Simplified Chinese");
  expect(requestPrompts[2]).toContain("Reply only in English");

  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByRole("textbox", { name: /note body/i }).fill("Remember this sentence");
  await page.getByRole("button", { name: /save note/i }).click();
  await expect(page.getByLabel("Saved notes")).toContainText("Remember this sentence");
});
