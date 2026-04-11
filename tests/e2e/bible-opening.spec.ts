import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";

const repoBibleFixturePath =
  "The Holy Bible English Standard Version (ESV) (Crossway Bibles) (z-library.sk, 1lib.sk, z-lib.sk).epub";
const localBibleFixturePath = "tests/fixtures/local/bible-esv.epub";
const bibleFixturePath = process.env.BIBLE_FIXTURE_PATH ??
  (existsSync(localBibleFixturePath) ? localBibleFixturePath : repoBibleFixturePath);

test.skip(!existsSync(bibleFixturePath), `Optional Bible fixture not available at ${bibleFixturePath}`);

test("Bible opening renders visible text without waiting for chapter toc hydration", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/");
  await page.setInputFiles("input[type=file]", bibleFixturePath);
  await expect(page).toHaveURL(/\/books\//);

  await expect
    .poll(
      async () =>
        page.locator(".epub-root iframe").evaluateAll((nodes) =>
          nodes.reduce((longest, node) => {
            const text = (node as HTMLIFrameElement).contentDocument?.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
            return Math.max(longest, text.length);
          }, 0),
        ),
      { timeout: 5000 },
    )
    .toBeGreaterThan(20);
});
