import { expect, test } from "@playwright/test";
import { selectTextInIframe } from "./helpers/epubSelection";

const fixturePath = "tests/fixtures/epub/minimal-valid.epub";

test("reader switches modes, keeps text selected, and applies appearance changes live", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("input[type=file]", fixturePath);
  await expect(page).toHaveURL(/\/books\//);

  await expect(page.getByRole("button", { name: /scrolled mode/i })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "scrolled");

  await page.getByRole("button", { name: /paginated mode/i }).click();

  await expect(page.getByRole("button", { name: /paginated mode/i })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");
  await expect(page.getByRole("button", { name: /next page/i })).toBeEnabled();
  await page.getByRole("button", { name: /next page/i }).click();

  const initialLineHeight = await page.locator(".epub-root iframe").evaluate((node) =>
    node.contentDocument?.body ? getComputedStyle(node.contentDocument.body).lineHeight : "",
  );
  const initialFontSize = await page.locator(".epub-root iframe").evaluate((node) =>
    node.contentDocument?.body ? getComputedStyle(node.contentDocument.body).fontSize : "",
  );

  await page.getByLabel("Line height").fill("2");
  await page.getByLabel("Font size").fill("1.3");

  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) =>
        node.contentDocument?.body ? getComputedStyle(node.contentDocument.body).lineHeight : "",
      ),
    )
    .not.toBe(initialLineHeight);

  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) =>
        node.contentDocument?.body ? getComputedStyle(node.contentDocument.body).fontSize : "",
      ),
    )
    .not.toBe(initialFontSize);

  const selected = await selectTextInIframe(page);
  expect(selected.length).toBeGreaterThan(0);

  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => node.contentWindow?.getSelection()?.toString().length ?? 0),
    )
    .toBeGreaterThan(0);
});

test("paginated mode restores the same page slice after refresh", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("input[type=file]", fixturePath);
  await expect(page).toHaveURL(/\/books\//);

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");

  await page.getByRole("button", { name: /next page/i }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /next page/i }).click();
  await page.waitForTimeout(1200);

  const before = await page.locator(".epub-root iframe").evaluate((node) => {
    const iframe = node;
    const root = iframe.closest(".epub-root");
    const container = root?.querySelector<HTMLElement>(".epub-container");
    return {
      scrollLeft: container?.scrollLeft ?? 0,
      text: iframe.contentDocument?.body?.innerText?.replace(/\s+/g, " ").trim().slice(0, 180) ?? "",
    };
  });

  await page.reload({ waitUntil: "networkidle" });

  const after = await page.locator(".epub-root iframe").evaluate((node) => {
    const iframe = node;
    const root = iframe.closest(".epub-root");
    const container = root?.querySelector<HTMLElement>(".epub-container");
    return {
      scrollLeft: container?.scrollLeft ?? 0,
      text: iframe.contentDocument?.body?.innerText?.replace(/\s+/g, " ").trim().slice(0, 180) ?? "",
    };
  });

  expect(after.scrollLeft).toBe(before.scrollLeft);
  expect(after.text).toBe(before.text);
});

test("paginated mode always renders as a single page column even after refresh", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("input[type=file]", fixturePath);
  await expect(page).toHaveURL(/\/books\//);

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");

  await page.getByLabel("Column count").selectOption("2");
  await page.waitForTimeout(400);

  const before = await page.locator(".epub-root iframe").evaluate((node) =>
    node.contentDocument?.body ? getComputedStyle(node.contentDocument.body).columnCount : "",
  );

  await page.reload({ waitUntil: "networkidle" });

  const after = await page.locator(".epub-root iframe").evaluate((node) =>
    node.contentDocument?.body ? getComputedStyle(node.contentDocument.body).columnCount : "",
  );

  expect(before).toBe("1");
  expect(after).toBe("1");
});
