import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";

const bibleFixturePath = process.env.BIBLE_FIXTURE_PATH ?? "tests/fixtures/local/bible-esv.epub";

test.skip(!existsSync(bibleFixturePath), `Optional local Bible fixture not available at ${bibleFixturePath}`);

async function importBible(page: Parameters<typeof test>[0]["page"]) {
  await page.goto("/");
  await page.setInputFiles("input[type=file]", bibleFixturePath);
  await expect(page).toHaveURL(/\/books\//);
  await expect(page.getByRole("navigation", { name: /table of contents/i })).toBeVisible();
}

test("scrolling the Bible toc keeps the reading workspace pinned to the first screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  const before = await page.evaluate(() => ({
    readerTop: document.querySelector(".reader-center")?.getBoundingClientRect().top ?? null,
    scrollY: window.scrollY,
  }));

  await page.getByRole("navigation", { name: /table of contents/i }).hover();
  await page.mouse.wheel(0, 2400);

  const after = await page.evaluate(() => ({
    readerTop: document.querySelector(".reader-center")?.getBoundingClientRect().top ?? null,
    scrollY: window.scrollY,
  }));

  expect(after.scrollY).toBe(0);
  expect(after.readerTop).toBe(before.readerTop);
});

test("Bible toc chapter navigation lands on the requested Genesis chapter anchor", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await importBible(page);

  await page.getByRole("button", { name: /expand genesis/i }).click();
  await page.getByRole("button", { name: "Chapter 1", exact: true }).click();

  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => {
        const doc = node.contentDocument;
        const target = doc?.getElementById("v01001001");
        const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
        return {
          containerScrollTop: container?.scrollTop ?? 0,
          targetTop: target?.getBoundingClientRect().top ?? null,
        };
      }),
    )
    .toEqual(
      expect.objectContaining({
        containerScrollTop: expect.any(Number),
        targetTop: expect.any(Number),
      }),
    );

  const metrics = await page.locator(".epub-root iframe").evaluate((node) => {
    const doc = node.contentDocument;
    const target = doc?.getElementById("v01001001");
    const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
    const targetText = target?.parentElement?.textContent?.replace(/\s+/g, " ").trim() ?? "";

    return {
      containerScrollTop: container?.scrollTop ?? 0,
      targetTop: target?.getBoundingClientRect().top ?? null,
      targetText,
    };
  });

  expect(metrics.containerScrollTop).toBeGreaterThan(100);
  expect(metrics.targetTop).not.toBeNull();
  expect(Math.abs((metrics.targetTop ?? 0) - metrics.containerScrollTop)).toBeLessThan(80);
  expect(metrics.targetText).toContain("In the beginning, God created the heavens and the earth.");
});
