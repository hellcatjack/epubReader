import { expect, test, type Page } from "@playwright/test";

const firstFixturePath = "tests/fixtures/epub/minimal-valid.epub";
const secondFixturePath = "tests/fixtures/epub/paginated-long.epub";

async function importBook(page: Page, fixturePath: string) {
  await page.setInputFiles("input[type=file]", fixturePath);
  await expect(page).toHaveURL(/\/books\//);
}

async function expectIframeText(page: Page, text: string) {
  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => node.contentDocument?.body?.innerText?.replace(/\s+/g, " ").trim() ?? ""),
    )
    .toContain(text);
}

test("reader route imports a new EPUB and opens it immediately", async ({ page }) => {
  await page.goto("/");
  await importBook(page, firstFixturePath);

  const topbar = page.getByRole("banner");
  await expect(page.getByRole("navigation", { name: /reader app navigation/i })).toHaveCount(0);
  await expect(topbar.getByRole("button", { name: /library/i })).toBeVisible();
  await expect(topbar.getByRole("button", { name: /import epub/i })).toBeVisible();
  await expect(topbar.getByRole("button", { name: /settings/i })).toBeVisible();
  await expectIframeText(page, "Hello world from the minimal valid fixture.");
  const firstUrl = page.url();

  await page.setInputFiles("input[type=file]", secondFixturePath);
  await expect.poll(() => page.url()).not.toBe(firstUrl);

  expect(page.url()).not.toBe(firstUrl);
  await expectIframeText(page, "Paginated keyboard navigation needs a chapter");
});

test("reader route opens the library drawer and switches to another imported book", async ({ page }) => {
  await page.goto("/");
  await importBook(page, firstFixturePath);
  await importBook(page, secondFixturePath);
  await page.setViewportSize({ width: 640, height: 900 });
  await expectIframeText(page, "Paginated keyboard navigation needs a chapter");

  await page.getByRole("banner").getByRole("button", { name: /library/i }).click();

  const drawer = page.getByRole("dialog", { name: /library drawer/i });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: /local books/i })).toBeVisible();
  await expect
    .poll(async () =>
      drawer.evaluate((node) => ({
        clientWidth: node.clientWidth,
        overflowX: getComputedStyle(node).overflowX,
        scrollWidth: node.scrollWidth,
        pageScrollWidth: document.documentElement.scrollWidth,
        pageClientWidth: document.documentElement.clientWidth,
      })),
    )
    .toEqual(
      expect.objectContaining({
        overflowX: "hidden",
        pageScrollWidth: 640,
        pageClientWidth: 640,
      }),
    );
  await drawer.getByRole("button", { name: /open book minimal valid epub/i }).click();

  await expect(drawer).not.toBeVisible();
  await expectIframeText(page, "Hello world from the minimal valid fixture.");
});

test("reader route opens settings without leaving the reading workspace", async ({ page }) => {
  await page.goto("/");
  await importBook(page, firstFixturePath);

  await page.getByRole("banner").getByRole("button", { name: /settings/i }).click();

  await expect(page.getByLabel("Reader settings panel")).toBeVisible();
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("button", { name: /bookmark this location/i })).toBeVisible();
});
