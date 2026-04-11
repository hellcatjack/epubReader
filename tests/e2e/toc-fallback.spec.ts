import { expect, test } from "@playwright/test";

const fixturePath = "tests/fixtures/epub/epub2-contents-page-toc.epub";

test("epub2 contents pages expand coarse ncx toc entries into chapter links in the sidebar", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("input[type=file]", fixturePath);
  await expect(page).toHaveURL(/\/books\//);

  const toc = page.getByRole("navigation", { name: /table of contents/i });
  await expect(toc.getByRole("button", { name: /^collected novel$/i })).toBeVisible();

  const toggle = toc.getByRole("button", { name: /collapse collected novel|expand collected novel/i });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }

  await expect(toc.getByRole("button", { name: /^chapter 1\. the riverbank$/i })).toBeVisible();
  await expect(toc.getByRole("button", { name: /^chapter 2\. the storm cellar$/i })).toBeVisible();
});
