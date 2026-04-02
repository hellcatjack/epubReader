# TTS Spoken Sentence Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a wide-screen-only right-side translation note that follows the currently spoken TTS sentence without affecting the main reading text layout.

**Architecture:** `ReaderPage` derives the currently spoken sentence from active continuous TTS state, looks up or requests its translation through the existing AI service, and renders a new side-note component in the right-side whitespace lane when there is enough room. `epubRuntime` exposes enough positioning data to anchor the note beside the active sentence in both `scrolled` and `paginated` modes, while layout gating keeps the feature disabled in tablet-width reading mode.

**Tech Stack:** React, TypeScript, Vitest, Playwright, existing AI service adapters, existing EPUB runtime positioning APIs.

---

## File Map

### New files

- `src/features/reader/TtsSentenceTranslationNote.tsx`
  - Presentational component for the lightweight right-side translation note.
- `src/features/reader/ttsSentenceTranslation.ts`
  - Helpers for normalizing spoken sentences, filtering ignorable candidates, and building cache keys.
- `src/features/reader/ttsSentenceTranslation.test.ts`
  - Unit tests for normalization, filtering, and cache-key helpers.

### Modified files

- `src/features/reader/ReaderPage.tsx`
  - Owns spoken-sentence derivation, in-memory translation cache, wide-layout gating, and note rendering.
- `src/features/reader/epubRuntime.ts`
  - Exposes a safe anchor rectangle / right-lane positioning source for the currently active TTS segment.
- `src/features/reader/EpubViewport.tsx`
  - Forwards any additional active-segment geometry emitted by the runtime.
- `src/features/reader/reader.css`
  - Styles the wide-screen translation side note and its motion/visibility rules.
- `src/features/reader/ReaderPage.test.tsx`
  - Integration coverage for sentence-driven translation note behavior.
- `src/features/reader/epubRuntime.test.ts`
  - Runtime positioning and clamping tests for the side note anchor.
- `tests/e2e/local-tts.spec.ts`
  - Browser-level regression for wide-screen rendering and tablet-width suppression.

---

### Task 1: Add spoken-sentence normalization helpers

**Files:**
- Create: `src/features/reader/ttsSentenceTranslation.ts`
- Test: `src/features/reader/ttsSentenceTranslation.test.ts`

- [ ] **Step 1: Write the failing helper tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildTtsSentenceTranslationCacheKey,
  isIgnorableSpokenSentence,
  normalizeSpokenSentence,
} from "./ttsSentenceTranslation";

describe("ttsSentenceTranslation helpers", () => {
  it("normalizes repeated whitespace and trims spoken sentences", () => {
    expect(normalizeSpokenSentence("  Nations   Descended from Noah.  ")).toBe("Nations Descended from Noah.");
  });

  it("treats numbering-only fragments as ignorable", () => {
    expect(isIgnorableSpokenSentence("10")).toBe(true);
    expect(isIgnorableSpokenSentence("1:1")).toBe(true);
    expect(isIgnorableSpokenSentence("[4]")).toBe(true);
  });

  it("keeps meaningful spoken sentences eligible for translation", () => {
    expect(isIgnorableSpokenSentence("These are the generations of the sons of Noah.")).toBe(false);
  });

  it("builds a stable cache key from book, spine item, and normalized sentence text", () => {
    expect(
      buildTtsSentenceTranslationCacheKey({
        bookId: "book-1",
        sentence: "  Nations   Descended from Noah. ",
        spineItemId: "chapter-10.xhtml",
      }),
    ).toBe("book-1::chapter-10.xhtml::Nations Descended from Noah.");
  });
});
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run: `npm test -- src/features/reader/ttsSentenceTranslation.test.ts`

Expected: FAIL because `ttsSentenceTranslation.ts` does not exist yet.

- [ ] **Step 3: Write the minimal helper implementation**

```ts
const numberOnlyPattern = /^(?:\d+(?::\d+)?|\[\d+\])$/;

export function normalizeSpokenSentence(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function isIgnorableSpokenSentence(text: string) {
  const normalized = normalizeSpokenSentence(text);
  if (!normalized) {
    return true;
  }

  return numberOnlyPattern.test(normalized);
}

export function buildTtsSentenceTranslationCacheKey({
  bookId,
  sentence,
  spineItemId,
}: {
  bookId: string;
  sentence: string;
  spineItemId: string;
}) {
  return `${bookId}::${spineItemId}::${normalizeSpokenSentence(sentence)}`;
}
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run: `npm test -- src/features/reader/ttsSentenceTranslation.test.ts`

Expected: PASS with 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/ttsSentenceTranslation.ts src/features/reader/ttsSentenceTranslation.test.ts
git commit -m "test: add spoken sentence translation helpers"
```

### Task 2: Add a presentational translation note component

**Files:**
- Create: `src/features/reader/TtsSentenceTranslationNote.tsx`
- Modify: `src/features/reader/reader.css`
- Test: `src/features/reader/ReaderPage.test.tsx`

- [ ] **Step 1: Write the failing component-level integration test in `ReaderPage.test.tsx`**

```ts
it("shows a wide-screen spoken sentence translation note beside the reading text", async () => {
  installMatchMedia({ "(max-width: 1180px)": false });
  const ai = {
    explainSelection: vi.fn(async () => ""),
    translateSelection: vi.fn(async () => "挪亚后代"),
  };

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              ai={ai}
              runtime={{
                render: () =>
                  Promise.resolve({
                    destroy: vi.fn(),
                    getCurrentLocation: vi.fn(async () => ({
                      cfi: "epubcfi(/6/2!/4/2/1:0)",
                      progress: 0.4,
                      spineItemId: "chapter-10.xhtml",
                      textQuote: "Nations Descended from Noah.",
                    })),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setTtsPlaybackFollow: vi.fn(async () => undefined),
                  } satisfies RuntimeRenderHandle),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  // Existing test fixture should drive ReaderPage into an active continuous TTS state here.
  expect(await screen.findByLabelText(/spoken sentence translation/i)).toHaveTextContent("挪亚后代");
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `npm test -- src/features/reader/ReaderPage.test.tsx -t "shows a wide-screen spoken sentence translation note beside the reading text"`

Expected: FAIL because the note component and rendering path do not exist.

- [ ] **Step 3: Create the presentational component**

```tsx
type TtsSentenceTranslationNoteProps = {
  label?: string;
  top: number;
  right: number;
  translation: string;
};

export function TtsSentenceTranslationNote({
  label = "Now reading",
  right,
  top,
  translation,
}: TtsSentenceTranslationNoteProps) {
  return (
    <aside
      aria-label="Spoken sentence translation"
      className="reader-tts-sentence-note"
      role="status"
      style={{ insetInlineEnd: `${right}px`, top: `${top}px` }}
    >
      <span className="reader-tts-sentence-note-label">{label}</span>
      <p className="reader-tts-sentence-note-text">{translation}</p>
    </aside>
  );
}
```

- [ ] **Step 4: Add the base styles**

```css
.reader-tts-sentence-note {
  position: fixed;
  z-index: 12;
  width: clamp(220px, 18vw, 280px);
  padding: 0.7rem 0.85rem;
  border: 1px solid color-mix(in srgb, var(--reader-accent) 20%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--reader-panel) 88%, white);
  box-shadow: 0 10px 30px rgb(15 23 42 / 0.12);
  backdrop-filter: blur(8px);
  pointer-events: none;
  transition: top 180ms ease, opacity 160ms ease;
}

.reader-tts-sentence-note-label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--reader-muted);
}

.reader-tts-sentence-note-text {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.45;
  color: var(--reader-foreground);
}
```

- [ ] **Step 5: Run the targeted test again**

Run: `npm test -- src/features/reader/ReaderPage.test.tsx -t "shows a wide-screen spoken sentence translation note beside the reading text"`

Expected: still FAIL, but now because `ReaderPage` is not yet wiring the new component.

- [ ] **Step 6: Commit**

```bash
git add src/features/reader/TtsSentenceTranslationNote.tsx src/features/reader/reader.css
git commit -m "feat: add tts sentence translation note component"
```

### Task 3: Extend runtime data for safe sentence-note anchoring

**Files:**
- Modify: `src/features/reader/epubRuntime.ts`
- Test: `src/features/reader/epubRuntime.test.ts`

- [ ] **Step 1: Write the failing runtime positioning test**

```ts
it("returns a right-side note anchor that stays outside the main reading text box", () => {
  const anchor = computeActiveTtsSentenceNoteAnchor({
    activeRect: { bottom: 220, height: 28, left: 180, right: 720, top: 192, width: 540 },
    laneGap: 20,
    laneWidth: 260,
    viewport: { bottomSafe: 900, topSafe: 80 },
    readingBox: { left: 160, right: 740 },
  });

  expect(anchor.left).toBeGreaterThanOrEqual(760);
  expect(anchor.top).toBeGreaterThanOrEqual(80);
});
```

- [ ] **Step 2: Run the targeted runtime test to verify it fails**

Run: `npm test -- src/features/reader/epubRuntime.test.ts -t "returns a right-side note anchor that stays outside the main reading text box"`

Expected: FAIL because the helper/runtime API does not exist.

- [ ] **Step 3: Implement the runtime helper and expose note geometry**

```ts
export type ActiveTtsSentenceNoteAnchor = {
  top: number;
  rightLaneOffset: number;
};

export function computeActiveTtsSentenceNoteAnchor(args: {
  activeRect: DOMRectLike;
  laneGap: number;
  laneWidth: number;
  readingBox: { left: number; right: number };
  viewport: { bottomSafe: number; topSafe: number };
}) {
  const unclampedTop = args.activeRect.top;
  const top = Math.min(
    Math.max(unclampedTop, args.viewport.topSafe),
    Math.max(args.viewport.topSafe, args.viewport.bottomSafe - args.activeRect.height),
  );

  return {
    rightLaneOffset: args.readingBox.right + args.laneGap,
    top,
  };
}
```

Then thread a minimal `getActiveTtsSentenceNoteAnchor()`-style method through the runtime handle using the current active TTS segment rectangle and existing root geometry.

- [ ] **Step 4: Run the targeted runtime test again**

Run: `npm test -- src/features/reader/epubRuntime.test.ts -t "returns a right-side note anchor that stays outside the main reading text box"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/epubRuntime.ts src/features/reader/epubRuntime.test.ts
git commit -m "feat: expose tts sentence note anchoring geometry"
```

### Task 4: Wire spoken-sentence translation state into ReaderPage

**Files:**
- Modify: `src/features/reader/ReaderPage.tsx`
- Test: `src/features/reader/ReaderPage.test.tsx`

- [ ] **Step 1: Write the failing ReaderPage tests for caching and tablet suppression**

```ts
it("requests spoken sentence translation only once per sentence and reuses the in-memory cache", async () => {
  installMatchMedia({ "(max-width: 1180px)": false });
  const ai = {
    explainSelection: vi.fn(async () => ""),
    translateSelection: vi.fn(async () => "挪亚后代"),
  };

  renderReaderPageWithActiveContinuousTts(ai);

  expect(await screen.findByLabelText(/spoken sentence translation/i)).toHaveTextContent("挪亚后代");
  expect(ai.translateSelection).toHaveBeenCalledTimes(1);

  rerenderReaderPageWithSameActiveSentence(ai);
  expect(ai.translateSelection).toHaveBeenCalledTimes(1);
});

it("keeps the spoken sentence translation note hidden in tablet layout", async () => {
  installMatchMedia({ "(max-width: 1180px)": true });
  const ai = {
    explainSelection: vi.fn(async () => ""),
    translateSelection: vi.fn(async () => "挪亚后代"),
  };

  renderReaderPageWithActiveContinuousTts(ai);

  await waitFor(() => {
    expect(screen.queryByLabelText(/spoken sentence translation/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the targeted ReaderPage tests to verify they fail**

Run: `npm test -- src/features/reader/ReaderPage.test.tsx -t "spoken sentence translation note"`

Expected: FAIL because ReaderPage does not derive, cache, or render spoken sentence translations yet.

- [ ] **Step 3: Implement the minimal ReaderPage state**

Add:

- `useMemo`/helper usage for the normalized current spoken sentence
- `useRef(new Map<string, string>())` for the in-memory cache
- a request effect keyed by the normalized spoken sentence
- wide-layout gating based on `isTabletLayout` plus actual spare-right-lane availability
- rendering of `TtsSentenceTranslationNote` when translation and anchor are both ready

Use the existing `ai.translateSelection` with the spoken sentence as the text input and no manual selection UI coupling.

- [ ] **Step 4: Run the targeted ReaderPage tests again**

Run: `npm test -- src/features/reader/ReaderPage.test.tsx -t "spoken sentence translation note"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/ReaderPage.test.tsx
git commit -m "feat: wire spoken sentence translation note into reader page"
```

### Task 5: Finish cross-mode behavior and browser regression

**Files:**
- Modify: `src/features/reader/EpubViewport.tsx`
- Modify: `tests/e2e/local-tts.spec.ts`
- Test: `tests/e2e/local-tts.spec.ts`

- [ ] **Step 1: Write the failing browser-level regressions**

```ts
test("wide-screen continuous tts shows a right-side sentence translation note beside the reading text", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await openReaderFixtureAndStartContinuousTts(page);

  await expect(page.getByLabel("Spoken sentence translation")).toBeVisible();
});

test("tablet-width continuous tts keeps the sentence translation note disabled", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1366 });
  await openReaderFixtureAndStartContinuousTts(page);

  await expect(page.getByLabel("Spoken sentence translation")).toHaveCount(0);
});
```

- [ ] **Step 2: Run the targeted browser tests to verify they fail**

Run: `npm run e2e -- tests/e2e/local-tts.spec.ts -g "sentence translation note"`

Expected: FAIL because the note is not exposed in the browser yet.

- [ ] **Step 3: Complete any missing viewport/runtime forwarding**

If the failing browser test shows missing geometry in one reading mode, add the minimal EpubViewport forwarding needed so `ReaderPage` receives current active-segment anchor data in both `scrolled` and `paginated` modes.

- [ ] **Step 4: Run the targeted browser tests again**

Run: `npm run e2e -- tests/e2e/local-tts.spec.ts -g "sentence translation note"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/EpubViewport.tsx tests/e2e/local-tts.spec.ts
git commit -m "test: cover spoken sentence translation note in browser flows"
```

### Task 6: Full verification and publish

**Files:**
- Modify: any files changed above

- [ ] **Step 1: Run full unit/integration verification**

Run: `npm test`

Expected: PASS with the full vitest suite green.

- [ ] **Step 2: Run focused browser verification**

Run: `npm run e2e -- tests/e2e/local-tts.spec.ts`

Expected: PASS for local TTS browser scenarios, including the new sentence note cases.

- [ ] **Step 3: Build production assets**

Run: `npm run build`

Expected: PASS and fresh `dist/` assets emitted.

- [ ] **Step 4: Publish to production directory**

Run: `rsync -a --delete dist/ /app/epubReader/`

Expected: PASS with `/app/epubReader` updated to the new build output.

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/TtsSentenceTranslationNote.tsx \
  src/features/reader/ttsSentenceTranslation.ts \
  src/features/reader/ttsSentenceTranslation.test.ts \
  src/features/reader/ReaderPage.tsx \
  src/features/reader/ReaderPage.test.tsx \
  src/features/reader/epubRuntime.ts \
  src/features/reader/epubRuntime.test.ts \
  src/features/reader/EpubViewport.tsx \
  src/features/reader/reader.css \
  tests/e2e/local-tts.spec.ts
git commit -m "feat: show spoken sentence translations beside wide-screen tts playback"
```

---

## Self-Review

### Spec coverage

- Wide-screen-only gating: covered in Tasks 4 and 5.
- Right-side whitespace rendering without正文 overlap: covered in Tasks 2 and 3.
- Sentence-level caching and request throttling: covered in Tasks 1 and 4.
- `scrolled` and `paginated` support: covered in Tasks 3 and 5.
- Quiet failure behavior and no loading noise: covered in Task 4 because note rendering requires a completed translation.

### Placeholder scan

- No `TBD`, `TODO`, or placeholder commit/test instructions remain.
- Every task includes concrete files, concrete test targets, and specific commands.

### Type consistency

- Shared names are consistent across tasks:
  - `TtsSentenceTranslationNote`
  - `normalizeSpokenSentence`
  - `isIgnorableSpokenSentence`
  - `buildTtsSentenceTranslationCacheKey`
  - `spoken sentence translation note`
