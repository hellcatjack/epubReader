import { expect, test } from "@playwright/test";
import { selectTextInIframe } from "./helpers/epubSelection";

const fixturePath = "tests/fixtures/epub/minimal-valid.epub";

test("ai actions translate explain and save a note for selected text", async ({ page }) => {
  await page.route("http://192.168.1.31:8001/v1/chat/completions", async (route) => {
    const body = route.request().postDataJSON();
    const prompt = JSON.stringify(body);
    const content = prompt.includes("Explain") ? "Stub explanation" : "Stub translation";

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
  await expect(page.getByLabel("AI result")).toContainText("Stub translation");

  await page.getByRole("button", { name: "Explain" }).click();
  await expect(page.getByLabel("AI result")).toContainText("Stub explanation");

  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByRole("textbox", { name: /note body/i }).fill("Remember this sentence");
  await page.getByRole("button", { name: /save note/i }).click();
  await expect(page.getByLabel("Saved notes")).toContainText("Remember this sentence");
});
