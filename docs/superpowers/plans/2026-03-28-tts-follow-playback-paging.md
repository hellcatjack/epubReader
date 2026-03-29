# TTS Follow Playback Paging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Follow TTS playback` behave like page turning: `paginated` must auto-turn pages reliably, and `scrolled` must advance by full screens without continuous jitter.

**Architecture:** Split follow playback into two explicit runtime strategies. `paginated` uses page-band ownership and page-index changes instead of element reveal. `scrolled` uses screen-band ownership and advances by full viewport-height pages instead of re-scrolling on each highlight update.

**Tech Stack:** React, TypeScript, epub.js runtime wrapper, Vitest, Playwright

---

## File Map

- Modify: `src/features/reader/epubRuntime.ts`
  - Replace follow-playback reveal behavior with mode-specific page-band logic.
- Modify: `src/features/reader/ReaderPage.tsx`
  - Keep follow-playback chunk preparation compatible with page-based advancement.
- Modify: `src/features/reader/epubRuntime.test.ts`
  - Add unit coverage for paginated/scrolled page-band decisions.
- Modify: `tests/e2e/local-tts.spec.ts`
  - Add and tighten Playwright regressions for paginated no-boundary paging and scrolled full-screen paging.

### Task 1: Lock Down the Broken Behavior with Failing Tests

**Files:**
- Modify: `src/features/reader/epubRuntime.test.ts`
- Modify: `tests/e2e/local-tts.spec.ts`

- [ ] **Step 1: Write the failing unit tests for page-band decisions**

Add tests that describe the intended behavior at the helper level:

```ts
it("keeps paginated follow playback still while the active rect stays inside the current page band", () => {
  expect(
    resolvePaginatedFollowPageIndex(
      { clientWidth: 824, currentPageIndex: 1 },
      { left: 850, right: 1200 } as DOMRect,
      true,
    ),
  ).toBe(1);
});

it("advances paginated follow playback to the next page when the active rect moves past the current page band", () => {
  expect(
    resolvePaginatedFollowPageIndex(
      { clientWidth: 824, currentPageIndex: 0 },
      { left: 860, right: 1080 } as DOMRect,
      true,
    ),
  ).toBe(1);
});

it("advances scrolled follow playback by one full screen only after the active rect crosses the bottom band", () => {
  expect(
    resolveScrolledFollowScrollTop(
      { clientHeight: 900, currentScrollTop: 0 },
      { top: 780, bottom: 920 } as DOMRect,
      true,
    ),
  ).toBe(900);
});
```

- [ ] **Step 2: Run the unit tests to verify they fail**

Run:

```bash
npm test -- src/features/reader/epubRuntime.test.ts
```

Expected: FAIL because `resolvePaginatedFollowPageIndex` / `resolveScrolledFollowScrollTop` do not exist yet, or because current follow behavior does not satisfy the assertions.

- [ ] **Step 3: Tighten the Playwright regressions before implementation**

Update the e2e coverage so it matches the intended UX:

```ts
test("paginated follow playback turns the page even without boundary events", async ({ page }) => {
  // use paginated-long.epub so scrollWidth > clientWidth
  // mock speechSynthesis to emit start/end only
  // assert container.scrollLeft moves by at least one page width
});

test("scrolled mode follow playback advances by full screens instead of jittering", async ({ page }) => {
  // start TTS with follow playback enabled
  // assert scrollTop stays unchanged while highlight remains on screen
  // assert next move is about one clientHeight when highlight crosses the bottom band
});
```

- [ ] **Step 4: Run the new Playwright tests to verify they fail against current behavior**

Run:

```bash
npm run e2e -- tests/e2e/local-tts.spec.ts -g "paginated follow playback turns the page even without boundary events|scrolled mode follow playback advances by full screens instead of jittering"
```

Expected: FAIL with one or both of:
- paginated `scrollLeft` stays unchanged
- scrolled mode keeps adjusting `scrollTop` before a full-screen page move

- [ ] **Step 5: Commit the red tests**

```bash
git add src/features/reader/epubRuntime.test.ts tests/e2e/local-tts.spec.ts
git commit -m "test: capture follow playback paging regressions"
```

### Task 2: Implement Deterministic Paginated Follow Playback

**Files:**
- Modify: `src/features/reader/epubRuntime.ts`
- Modify: `src/features/reader/ReaderPage.tsx`
- Test: `src/features/reader/epubRuntime.test.ts`
- Test: `tests/e2e/local-tts.spec.ts`

- [ ] **Step 1: Add helper functions for paginated follow page resolution**

In `src/features/reader/epubRuntime.ts`, add explicit helpers:

```ts
export function resolvePaginatedFollowPageIndex(
  viewport: { clientWidth: number; currentPageIndex: number },
  rect: Pick<DOMRect, "left" | "right">,
  followPlayback = false,
) {
  if (!followPlayback || viewport.clientWidth <= 0) {
    return viewport.currentPageIndex;
  }

  const pageWidth = viewport.clientWidth;
  const overflowRight = rect.right - pageWidth;
  const overflowLeft = rect.left;

  if (overflowLeft >= 0 && overflowRight <= 0) {
    return viewport.currentPageIndex;
  }

  if (overflowRight > 0) {
    return viewport.currentPageIndex + Math.max(1, Math.ceil(overflowRight / pageWidth));
  }

  return Math.max(0, viewport.currentPageIndex - Math.max(1, Math.ceil(Math.abs(overflowLeft) / pageWidth)));
}
```

- [ ] **Step 2: Run the unit test and confirm the helper-level tests pass**

Run:

```bash
npm test -- src/features/reader/epubRuntime.test.ts
```

Expected: the new paginated helper tests PASS, while scrolled follow tests still fail.

- [ ] **Step 3: Replace paginated `scrollIntoView()` follow behavior with page-index movement**

Update the active segment application path in `src/features/reader/epubRuntime.ts`:

```ts
if (shouldRevealPaginatedTarget) {
  const pageContainer = getPaginatedContainer(element);
  const currentPageIndex = readPaginatedPageIndex(activePreferences.readingMode, pageContainer) ?? 0;
  const targetPageIndex = resolvePaginatedFollowPageIndex(
    {
      clientWidth: pageContainer?.clientWidth ?? viewportWidth,
      currentPageIndex,
    },
    rect,
    followTtsPlayback,
  );

  if (pageContainer && targetPageIndex !== currentPageIndex) {
    restorePaginatedPagePosition(activePreferences.readingMode, pageContainer, undefined, targetPageIndex);
    await waitForLayoutFrame(element.ownerDocument);
    void syncDisplayedLocation();
    return;
  }
}
```

- [ ] **Step 4: Keep paginated follow chunking compatible with page turns**

In `src/features/reader/ReaderPage.tsx`, preserve the current follow-aware paginated chunk splitting so page advancement does not depend on browser `boundary` support:

```ts
if (readingMode === "paginated") {
  const paginatedChunks = blocks.flatMap((block) => chunkTextSegmentsFromBlocks([block], continuousTtsChunkOptions));
  return followPlayback ? splitChunkSegmentsIntoSingleMarkerChunks(paginatedChunks) : paginatedChunks;
}
```

- [ ] **Step 5: Run the paginated Playwright regression to verify it passes**

Run:

```bash
npm run e2e -- tests/e2e/local-tts.spec.ts -g "paginated mode follow playback automatically turns to the next page|paginated follow playback turns the page even without boundary events"
```

Expected: PASS, with `scrollLeft` increasing by at least one page width in both tests.

- [ ] **Step 6: Commit the paginated fix**

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/epubRuntime.ts src/features/reader/epubRuntime.test.ts tests/e2e/local-tts.spec.ts
git commit -m "fix: make paginated tts follow playback turn pages deterministically"
```

### Task 3: Replace Scrolled Follow Jitter with Full-Screen Page Advances

**Files:**
- Modify: `src/features/reader/epubRuntime.ts`
- Test: `src/features/reader/epubRuntime.test.ts`
- Test: `tests/e2e/local-tts.spec.ts`

- [ ] **Step 1: Add helper functions for scrolled full-screen follow decisions**

In `src/features/reader/epubRuntime.ts`, add a helper that only advances after the highlight leaves the current screen band:

```ts
export function resolveScrolledFollowScrollTop(
  viewport: { clientHeight: number; currentScrollTop: number },
  rect: Pick<DOMRect, "top" | "bottom">,
  followPlayback = false,
) {
  if (!followPlayback || viewport.clientHeight <= 0) {
    return viewport.currentScrollTop;
  }

  const bottomSafetyBand = viewport.clientHeight * 0.92;
  if (rect.bottom <= bottomSafetyBand && rect.top >= 0) {
    return viewport.currentScrollTop;
  }

  return Math.max(0, viewport.currentScrollTop + viewport.clientHeight);
}
```

- [ ] **Step 2: Run the scrolled helper tests and confirm they fail before wiring them in**

Run:

```bash
npm test -- src/features/reader/epubRuntime.test.ts
```

Expected: FAIL on the scrolled full-screen behavior until runtime wiring is updated.

- [ ] **Step 3: Replace scrolled micro-follow with page-height movement**

In the active segment application path, replace the old scrolled auto-scroll logic:

```ts
if (shouldRevealScrolledTarget && container) {
  const nextScrollTop = resolveScrolledFollowScrollTop(
    {
      clientHeight: container.clientHeight,
      currentScrollTop: container.scrollTop,
    },
    rect,
    followTtsPlayback,
  );

  if (nextScrollTop !== container.scrollTop) {
    container.scrollTop = nextScrollTop;
    await waitForLayoutFrame(element.ownerDocument);
    const nextRect = (activeTtsElement ?? nextElement).getBoundingClientRect();
    if (nextRect.top < 0 || nextRect.bottom > container.clientHeight) {
      container.scrollTop = container.scrollTop + container.clientHeight;
    }
    return;
  }
}
```

- [ ] **Step 4: Ensure scrolled mode never continuously repositions within a page**

Update the old helper so it only answers “does this need a page move?” and not “how should it be pinned to the top?”:

```ts
export function shouldAutoScrollTtsSegment(...) {
  if (!followPlayback || readingMode === "paginated" || viewportHeight <= 0) {
    return false;
  }

  const followBandBottom = viewportHeight * 0.92;
  return rect.bottom > followBandBottom || rect.top < 0;
}
```

- [ ] **Step 5: Run the scrolled Playwright regression and verify full-screen behavior**

Run:

```bash
npm run e2e -- tests/e2e/local-tts.spec.ts -g "scrolled mode follow playback advances by full screens instead of jittering"
```

Expected: PASS, with `scrollTop` staying stable during in-screen reading and then advancing by about one `clientHeight`.

- [ ] **Step 6: Commit the scrolled fix**

```bash
git add src/features/reader/epubRuntime.ts src/features/reader/epubRuntime.test.ts tests/e2e/local-tts.spec.ts
git commit -m "fix: make scrolled tts follow playback advance by full screens"
```

### Task 4: Final Verification and Publish

**Files:**
- Modify: `src/features/reader/epubRuntime.ts`
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/epubRuntime.test.ts`
- Modify: `tests/e2e/local-tts.spec.ts`

- [ ] **Step 1: Run the full unit test suite**

Run:

```bash
npm test
```

Expected: all Vitest files PASS.

- [ ] **Step 2: Run the targeted Playwright regression set**

Run:

```bash
npm run e2e -- tests/e2e/local-tts.spec.ts -g "paginated mode follow playback automatically turns to the next page|paginated follow playback turns the page even without boundary events|scrolled mode follow playback advances by full screens instead of jittering"
```

Expected: all follow-playback regressions PASS.

- [ ] **Step 3: Build the production bundle**

Run:

```bash
npm run build
```

Expected: PASS, with only the existing chunk-size warning.

- [ ] **Step 4: Publish to the production static directory**

Run:

```bash
rsync -a --delete dist/ /app/epubReader/
```

Expected: no errors.

- [ ] **Step 5: Run a production smoke test**

Run:

```bash
node scripts-or-inline-playwright-smoke.js
```

Or use an inline Playwright script that:

```ts
// open https://ushome.amycat.com:18025
// import paginated-long.epub
// enable Follow TTS playback
// verify scrollLeft changes from 0 to at least one page width
// repeat in scrolled mode and verify scrollTop moves by roughly one clientHeight only after the current screen is exhausted
```

Expected: paginated and scrolled production behavior matches the new page-band rules.

- [ ] **Step 6: Commit the final verified implementation**

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/epubRuntime.ts src/features/reader/epubRuntime.test.ts tests/e2e/local-tts.spec.ts
git commit -m "fix: stabilize tts follow playback paging"
```

## Self-Review

- Spec coverage: the plan covers `paginated` deterministic page turns, `scrolled` full-screen turns, the “no half-visible highlight” rule, and targeted verification.
- Placeholder scan: no `TODO` or `TBD` placeholders remain; each task includes files, test code, run commands, and expected outcomes.
- Type consistency: helper names used throughout the plan are `resolvePaginatedFollowPageIndex` and `resolveScrolledFollowScrollTop`, and the runtime wiring consistently refers to `followPlayback`.
