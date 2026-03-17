import { expect, test } from "@playwright/test";

const fixturePath = "tests/fixtures/epub/minimal-valid.epub";

test("bookshelf flow imports, reopens, and deletes a book", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("input[type=file]", fixturePath);
  await expect(page).toHaveURL(/\/books\//);
  await expect(page.getByRole("button", { name: /bookmark this location/i })).toBeVisible();

  const viewportHeight = await page.locator(".epub-root").evaluate((node) => node.getBoundingClientRect().height);
  expect(viewportHeight).toBeGreaterThan(100);

  const visibleText = await page.locator(".epub-root iframe").evaluate((node) =>
    node.contentDocument?.body?.textContent?.trim().length ?? 0,
  );
  expect(visibleText).toBeGreaterThan(20);

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /continue reading/i })).toBeVisible();
  await page.getByRole("button", { name: /continue minimal valid epub/i }).click();
  await expect(page).toHaveURL(/\/books\//);
  await page.goto("/", { waitUntil: "networkidle" });
  const localBooks = page.getByRole("region", { name: /local books/i });
  await expect(localBooks.getByRole("link", { name: "Minimal Valid EPUB" })).toBeVisible();
  await page.getByRole("button", { name: /delete book minimal valid epub/i }).click();
  await expect(localBooks.getByRole("link", { name: "Minimal Valid EPUB" })).not.toBeVisible();
});
