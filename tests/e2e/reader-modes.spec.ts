import { expect, test } from "@playwright/test";
import { selectTextInIframe } from "./helpers/epubSelection";

const fixturePath = "tests/fixtures/epub/minimal-valid.epub";
const paginatedFixturePath = "tests/fixtures/epub/paginated-long.epub";
const paginatedMultiChapterFixturePath = "tests/fixtures/epub/paginated-multi-chapter.epub";

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

test("paginated mode ignores typography column-count overrides while keeping long chapters horizontally paged", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedFixturePath);
  await expect(page).toHaveURL(/\/books\//);

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");

  await page.getByLabel("Column count").selectOption("2");
  await page.waitForTimeout(400);

  const before = await page.locator(".epub-root iframe").evaluate((node) => {
    const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
    return {
      columnCount: node.contentDocument?.body ? getComputedStyle(node.contentDocument.body).columnCount : "",
      clientWidth: container?.clientWidth ?? 0,
      scrollWidth: container?.scrollWidth ?? 0,
    };
  });

  await page.reload({ waitUntil: "networkidle" });

  const after = await page.locator(".epub-root iframe").evaluate((node) => {
    const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
    return {
      columnCount: node.contentDocument?.body ? getComputedStyle(node.contentDocument.body).columnCount : "",
      clientWidth: container?.clientWidth ?? 0,
      scrollWidth: container?.scrollWidth ?? 0,
    };
  });

  expect(before.columnCount).not.toBe("2");
  expect(after.columnCount).not.toBe("2");
  expect(before.scrollWidth).toBeGreaterThan(before.clientWidth);
  expect(after.scrollWidth).toBeGreaterThan(after.clientWidth);
});

test("scrolled mode keeps a comfortably wider prose page than paginated mode", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/");
  await page.setInputFiles("input[type=file]", fixturePath);
  await expect(page).toHaveURL(/\/books\//);

  const scrolledWidth = await page.locator(".epub-root").evaluate((node) => node.getBoundingClientRect().width);

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");

  const paginatedWidth = await page.locator(".epub-root").evaluate((node) => node.getBoundingClientRect().width);

  expect(scrolledWidth).toBeGreaterThan(520);
  expect(scrolledWidth).toBeGreaterThan(paginatedWidth * 1.8);
});

test("scrolled mode allocates at least 800px to the prose page on a 1600px desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto("/");
  await page.setInputFiles("input[type=file]", fixturePath);
  await expect(page).toHaveURL(/\/books\//);

  const scrolledWidth = await page.locator(".epub-root").evaluate((node) => node.getBoundingClientRect().width);

  expect(scrolledWidth).toBeGreaterThanOrEqual(800);
});

test("paginated mode turns pages with arrow keys when focus is in the reading surface or top bar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedMultiChapterFixturePath);
  await expect(page).toHaveURL(/\/books\//);

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");
  await expect(page.getByRole("button", { name: /next page/i })).toBeEnabled();
  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => {
        const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
        return {
          clientWidth: container?.clientWidth ?? 0,
          scrollWidth: container?.scrollWidth ?? 0,
        };
      }),
    )
    .toEqual(
      expect.objectContaining({
        clientWidth: expect.any(Number),
        scrollWidth: expect.any(Number),
      }),
    );
  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => {
        const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
        const clientWidth = container?.clientWidth ?? 0;
        const scrollWidth = container?.scrollWidth ?? 0;
        return scrollWidth > clientWidth && clientWidth > 0;
      }),
    )
    .toBe(true);

  const initialScrollLeft = await page.locator(".epub-root iframe").evaluate((node) => {
    const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
    return container?.scrollLeft ?? 0;
  });

  await page.frameLocator(".epub-root iframe").locator("body").click({
    position: {
      x: 10,
      y: 10,
    },
  });
  await expect
    .poll(async () =>
      page.evaluate(() => ({
        activeTag: document.activeElement?.tagName ?? null,
        activeTopbar: document.activeElement instanceof Element ? Boolean(document.activeElement.closest(".reader-topbar")) : false,
      })),
    )
    .toEqual({
      activeTag: "IFRAME",
      activeTopbar: false,
    });
  const scrollAfterContentFocus = await page.locator(".epub-root iframe").evaluate((node) => {
    const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
    return container?.scrollLeft ?? 0;
  });
  expect(scrollAfterContentFocus).toBe(initialScrollLeft);
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => {
        const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
        return container?.scrollLeft ?? 0;
      }),
    )
    .toBeGreaterThan(initialScrollLeft);

  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => {
        const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
        return container?.scrollLeft ?? 0;
      }),
    )
    .toBe(initialScrollLeft);

  const topbar = page.getByRole("banner");
  await topbar.press("ArrowRight");

  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => {
        const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
        return container?.scrollLeft ?? 0;
      }),
    )
    .toBeGreaterThan(initialScrollLeft);

  await topbar.press("ArrowLeft");
  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => {
        const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
        return container?.scrollLeft ?? 0;
      }),
    )
    .toBe(initialScrollLeft);
});

test("paginated mode turns pages with the mouse wheel when the pointer is over the reading surface", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedFixturePath);
  await expect(page).toHaveURL(/\/books\//);

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");
  await expect(page.getByRole("button", { name: /next page/i })).toBeEnabled();
  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => {
        const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
        const clientWidth = container?.clientWidth ?? 0;
        const scrollWidth = container?.scrollWidth ?? 0;
        return scrollWidth > clientWidth && clientWidth > 0;
      }),
    )
    .toBe(true);

  const initialScrollLeft = await page.locator(".epub-root iframe").evaluate((node) => {
    const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
    return container?.scrollLeft ?? 0;
  });

  await page.frameLocator(".epub-root iframe").locator("body").hover({
    position: {
      x: 40,
      y: 40,
    },
  });
  await page.mouse.wheel(0, 900);

  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => {
        const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
        return container?.scrollLeft ?? 0;
      }),
    )
    .toBeGreaterThan(initialScrollLeft);

  await page.mouse.wheel(0, -900);

  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => {
        const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
        return container?.scrollLeft ?? 0;
      }),
    )
    .toBe(initialScrollLeft);
});

test("paginated mode keeps reading-surface arrow paging active after crossing into the next chapter", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedMultiChapterFixturePath);
  await expect(page).toHaveURL(/\/books\//);

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");
  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => {
        const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
        const clientWidth = container?.clientWidth ?? 0;
        const scrollWidth = container?.scrollWidth ?? 0;
        return scrollWidth > clientWidth && clientWidth > 0;
      }),
    )
    .toBe(true);

  await page.frameLocator(".epub-root iframe").locator("body").click({
    position: {
      x: 10,
      y: 10,
    },
  });
  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => {
        const doc = node.contentDocument;
        return {
          activeTag: document.activeElement?.tagName ?? null,
          frameActiveTag: doc?.activeElement?.tagName ?? null,
          text: doc?.body?.innerText ?? "",
        };
      }),
    )
    .toEqual(
      expect.objectContaining({
        activeTag: "IFRAME",
        frameActiveTag: "BODY",
        text: expect.stringContaining("Chapter One opens in the archive stairwell"),
      }),
    );

  let chapterTwoReached = false;
  let previousState = await page.locator(".epub-root iframe").evaluate((node) => {
    const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
    const doc = node.contentDocument;
    return {
      scrollLeft: container?.scrollLeft ?? 0,
      text: doc?.body?.innerText ?? "",
    };
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);

    const state = await page.locator(".epub-root iframe").evaluate((node) => {
      const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
      const doc = node.contentDocument;
      return {
        activeTag: document.activeElement?.tagName ?? null,
        frameActiveTag: doc?.activeElement?.tagName ?? null,
        scrollLeft: container?.scrollLeft ?? 0,
        text: doc?.body?.innerText ?? "",
      };
    });

    if (state.text.includes("Chapter Two opens beside the maintenance cabinet downstairs")) {
      chapterTwoReached = true;
      break;
    }

    expect(state.scrollLeft !== previousState.scrollLeft || state.text !== previousState.text).toBe(true);
    previousState = {
      scrollLeft: state.scrollLeft,
      text: state.text,
    };
  }

  expect(chapterTwoReached).toBe(true);

  const chapterTwoStart = await page.locator(".epub-root iframe").evaluate((node) => {
    const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
    const doc = node.contentDocument;
    return {
      activeTag: document.activeElement?.tagName ?? null,
      frameActiveTag: doc?.activeElement?.tagName ?? null,
      scrollLeft: container?.scrollLeft ?? 0,
      text: doc?.body?.innerText ?? "",
    };
  });
  expect(chapterTwoStart.text).toContain("Chapter Two opens beside the maintenance cabinet downstairs");

  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => {
      const nextState = await page.locator(".epub-root iframe").evaluate((node) => {
        const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
        const doc = node.contentDocument;
        return {
          activeTag: document.activeElement?.tagName ?? null,
          frameActiveTag: doc?.activeElement?.tagName ?? null,
          scrollLeft: container?.scrollLeft ?? 0,
          text: doc?.body?.innerText ?? "",
        };
      });

      return (
        nextState.scrollLeft > chapterTwoStart.scrollLeft ||
        (nextState.text !== chapterTwoStart.text && nextState.text.includes("Chapter Two opens beside the maintenance cabinet downstairs"))
      );
    })
    .toBe(true);
});

test("table of contents jumps to the selected chapter after reopening a paginated book", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedMultiChapterFixturePath);
  await expect(page).toHaveURL(/\/books\//);

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");

  await expect(page.getByRole("button", { name: "Chapter 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Chapter 2" })).toBeVisible();

  await page.getByRole("button", { name: "Chapter 2" }).click();

  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => node.contentDocument?.body?.innerText?.replace(/\s+/g, " ").trim() ?? ""),
    )
    .toContain("Chapter Two opens beside the maintenance cabinet downstairs");
});

test("paginated mode returns to the previous chapter's last page when left arrow crosses a chapter boundary", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("input[type=file]", paginatedMultiChapterFixturePath);
  await expect(page).toHaveURL(/\/books\//);

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");
  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => {
        const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
        const clientWidth = container?.clientWidth ?? 0;
        const scrollWidth = container?.scrollWidth ?? 0;
        return scrollWidth > clientWidth && clientWidth > 0;
      }),
    )
    .toBe(true);

  await page.frameLocator(".epub-root iframe").locator("body").click({
    position: {
      x: 10,
      y: 10,
    },
  });

  let chapterTwoReached = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);

    const text = await page.locator(".epub-root iframe").evaluate((node) => node.contentDocument?.body?.innerText ?? "");
    if (text.includes("Chapter Two opens beside the maintenance cabinet downstairs")) {
      chapterTwoReached = true;
      break;
    }
  }

  expect(chapterTwoReached).toBe(true);

  const chapterTwoFirstPage = await page.locator(".epub-root iframe").evaluate((node) => {
    const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
    const doc = node.contentDocument;
    return {
      scrollLeft: container?.scrollLeft ?? 0,
      text: doc?.body?.innerText ?? "",
    };
  });
  expect(chapterTwoFirstPage.scrollLeft).toBe(0);

  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => {
        const doc = node.contentDocument;
        return doc?.body?.innerText ?? "";
      }),
    )
    .toContain("Chapter One opens in the archive stairwell");

  const previousChapterPage = await page.locator(".epub-root iframe").evaluate((node) => {
    const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
    const doc = node.contentDocument;
    return {
      clientWidth: container?.clientWidth ?? 0,
      scrollLeft: container?.scrollLeft ?? 0,
      scrollWidth: container?.scrollWidth ?? 0,
      text: doc?.body?.innerText ?? "",
    };
  });

  expect(previousChapterPage.scrollWidth).toBeGreaterThan(previousChapterPage.clientWidth);
  expect(previousChapterPage.scrollLeft).toBeGreaterThan(0);

  await page.keyboard.press("ArrowRight");

  await expect
    .poll(async () =>
      page.locator(".epub-root iframe").evaluate((node) => {
        const container = node.closest(".epub-root")?.querySelector<HTMLElement>(".epub-container");
        const doc = node.contentDocument;
        return {
          scrollLeft: container?.scrollLeft ?? 0,
          text: doc?.body?.innerText ?? "",
        };
      }),
    )
    .toEqual({
      scrollLeft: 0,
      text: expect.stringContaining("Chapter Two opens beside the maintenance cabinet downstairs"),
    });
});
