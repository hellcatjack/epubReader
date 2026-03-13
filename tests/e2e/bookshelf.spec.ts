import { expect, test } from "@playwright/test";

const fixturePath = "tests/fixtures/epub/minimal-valid.epub";

test("bookshelf flow imports, reopens, and deletes a book", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("input[type=file]", fixturePath);
  await expect(page).toHaveURL(/\/books\//);
  await expect(page.getByRole("button", { name: /bookmark this location/i })).toBeVisible();

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText("Minimal Valid EPUB")).toBeVisible();
  await page.getByRole("button", { name: /delete book minimal valid epub/i }).click();
  await expect(page.getByText("Minimal Valid EPUB")).not.toBeVisible();
});
