# EPUB Reader TTS Progress and Recovery Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic selection TTS, in-text continuous TTS progress marking, adjustable TTS speed controls, and more reliable reading progress recovery with a visible bookshelf `Continue reading` entry point.

**Architecture:** Extend the existing browser-native TTS reader path rather than introducing any new backend. The work splits into four connected areas: selection/TTS orchestration, viewport progress marking, richer persisted progress metadata with fallback restore, and bookshelf recovery UX.

**Tech Stack:** React, TypeScript, `epub.js`, Dexie/IndexedDB, Vitest, Playwright, Web Speech API (`speechSynthesis`)

---

## Planned File Structure

- Selection auto-TTS and queue behavior
  - Modify: `src/features/reader/ReaderPage.tsx`
  - Modify: `src/features/reader/selectionActions.test.tsx`
  - Modify: `src/features/tts/browserTtsClient.ts`
  - Modify: `src/features/tts/browserTtsClient.test.ts`
- Continuous TTS progress marker
  - Modify: `src/features/reader/EpubViewport.tsx`
  - Modify: `src/features/reader/epubRuntime.ts`
  - Modify: `src/features/reader/reader.css`
  - Modify: `src/features/reader/ReaderPage.test.tsx`
  - Modify: `tests/e2e/local-tts.spec.ts`
- TTS rate controls
  - Modify: `src/features/reader/panels/TtsStatusPanel.tsx`
  - Modify: `src/features/reader/panels/TtsStatusPanel.test.tsx`
  - Modify: `src/features/settings/SettingsDialog.tsx`
  - Modify: `src/features/settings/settingsDialog.test.tsx`
  - Modify: `src/features/reader/RightPanel.tsx`
- Progress persistence and recovery
  - Modify: `src/lib/types/books.ts`
  - Modify: `src/features/bookshelf/progressRepository.ts`
  - Modify: `src/features/reader/EpubViewport.tsx`
  - Modify: `src/features/reader/epubRuntime.ts`
  - Modify: `src/features/bookshelf/BookshelfPage.tsx`
  - Modify: `src/features/bookshelf/BookshelfPage.test.tsx`
  - Modify: `tests/e2e/bookshelf.spec.ts`

## Chunk 1: Selection Auto-TTS and Reader Queue Integration

### Task 1: Add failing tests for automatic selection TTS

**Files:**
- Modify: `src/features/reader/selectionActions.test.tsx`
- Modify: `src/features/tts/browserTtsClient.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("auto-translates and auto-reads a new selection once", async () => {
  render(<ReaderPage />);
  act(() => {
    selectionBridge.publish({ cfiRange: "epubcfi(...)", spineItemId: "chap-1", text: "Hello world" });
  });
  await waitFor(() => expect(ai.translateSelection).toHaveBeenCalledWith("Hello world", expect.anything()));
  await waitFor(() => expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1));
});

it("does not auto-read punctuation-only selections", async () => {
  render(<ReaderPage />);
  act(() => {
    selectionBridge.publish({ cfiRange: "epubcfi(...)", spineItemId: "chap-1", text: "..." });
  });
  await waitFor(() => expect(ai.translateSelection).toHaveBeenCalledTimes(1));
  expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run src/features/reader/selectionActions.test.tsx src/features/tts/browserTtsClient.test.ts`

Expected: FAIL because selection changes currently auto-translate but do not auto-speak.

- [ ] **Step 3: Write the minimal implementation**

Update `ReaderPage.tsx` so that:

- selection auto-translation and selection auto-read share the same selection key
- auto-read only runs when the selection:
  - is non-empty after trim
  - is not punctuation-only
  - has not already triggered in the current selection cycle
- automatic selection TTS uses the existing browser TTS client directly

If needed, extend `browserTtsClient.ts` with a small helper for validating or selecting default voices without changing its public contract more than necessary.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx vitest run src/features/reader/selectionActions.test.tsx src/features/tts/browserTtsClient.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/selectionActions.test.tsx src/features/tts/browserTtsClient.ts src/features/tts/browserTtsClient.test.ts
git commit -m "feat: auto-read selected text with translation"
```

## Chunk 2: In-Text Continuous TTS Progress Marking

### Task 2: Add failing tests for active spoken segment marking

**Files:**
- Modify: `src/features/reader/ReaderPage.test.tsx`
- Modify: `tests/e2e/local-tts.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("tracks the active continuous tts segment for viewport highlighting", async () => {
  renderReaderPageWithRuntimeText("First paragraph.\n\nSecond paragraph.");
  await user.click(screen.getByRole("button", { name: /start tts/i }));
  await waitFor(() => {
    expect(screen.getByText(/current: first paragraph/i)).toBeInTheDocument();
  });
  expect(onTtsSegmentChange).toHaveBeenCalledWith(
    expect.objectContaining({ text: expect.stringContaining("First paragraph") }),
  );
});
```

```ts
test("continuous tts updates visible in-text progress styling", async ({ page }) => {
  await startBookAndTts(page);
  await expect(page.locator(".reader-tts-active-segment")).toHaveCount(1);
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run src/features/reader/ReaderPage.test.tsx`

Run: `npx playwright test tests/e2e/local-tts.spec.ts`

Expected: FAIL because no in-text TTS marker exists yet.

- [ ] **Step 3: Write the minimal implementation**

Update:

- `ReaderPage.tsx` to track active continuous segment metadata
- `epubRuntime.ts` to expose a way to mark or clear the active TTS segment in the rendered contents
- `EpubViewport.tsx` to pass the current active segment marker into the runtime
- `reader.css` to style the active spoken segment with a soft background highlight

Behavior:

- only continuous TTS uses the in-text progress marker
- if locating the segment fails, playback continues and only the right panel state updates
- if the segment is offscreen, attempt a gentle scroll so it stays visible

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx vitest run src/features/reader/ReaderPage.test.tsx`

Run: `npx playwright test tests/e2e/local-tts.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/EpubViewport.tsx src/features/reader/epubRuntime.ts src/features/reader/reader.css src/features/reader/ReaderPage.test.tsx tests/e2e/local-tts.spec.ts
git commit -m "feat: show active continuous tts segment in reader"
```

## Chunk 3: TTS Speed Controls

### Task 3: Add failing tests for saved and in-reader TTS rate control

**Files:**
- Modify: `src/features/reader/panels/TtsStatusPanel.tsx`
- Modify: `src/features/reader/panels/TtsStatusPanel.test.tsx`
- Modify: `src/features/settings/SettingsDialog.tsx`
- Modify: `src/features/settings/settingsDialog.test.tsx`
- Modify: `src/features/reader/RightPanel.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
it("renders quick rate controls in the tts panel", () => {
  render(<TtsStatusPanel status="idle" rate={1} />);
  expect(screen.getByRole("button", { name: /1.2x/i })).toBeInTheDocument();
});

it("persistently updates tts rate from the quick control", async () => {
  renderReaderPage();
  await user.click(screen.getByRole("button", { name: /1.2x/i }));
  await expect(getSettings()).resolves.toMatchObject({ ttsRate: 1.2 });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run src/features/reader/panels/TtsStatusPanel.test.tsx src/features/settings/settingsDialog.test.tsx src/features/reader/ReaderPage.test.tsx`

Expected: FAIL because the panel does not yet provide quick speed controls.

- [ ] **Step 3: Write the minimal implementation**

Update the TTS panel to show curated quick rates:

- `0.8x`
- `1.0x`
- `1.2x`
- `1.4x`

Wire the selected rate so that:

- the TTS panel updates `settings.ttsRate`
- the settings dialog still shows the saved numeric value
- new speech actions use the updated rate

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx vitest run src/features/reader/panels/TtsStatusPanel.test.tsx src/features/settings/settingsDialog.test.tsx src/features/reader/ReaderPage.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/panels/TtsStatusPanel.tsx src/features/reader/panels/TtsStatusPanel.test.tsx src/features/settings/SettingsDialog.tsx src/features/settings/settingsDialog.test.tsx src/features/reader/RightPanel.tsx src/features/reader/ReaderPage.tsx
git commit -m "feat: add saved and quick tts rate controls"
```

## Chunk 4: Progress Recovery and Bookshelf Continue Reading

### Task 4: Add failing tests for richer progress persistence and fallback restore

**Files:**
- Modify: `src/lib/types/books.ts`
- Modify: `src/features/bookshelf/progressRepository.ts`
- Modify: `src/features/reader/EpubViewport.tsx`
- Modify: `src/features/reader/epubRuntime.ts`
- Modify: `src/features/bookshelf/BookshelfPage.test.tsx`
- Modify: `tests/e2e/bookshelf.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("saves fallback progress metadata including spine item, text quote, and updatedAt", async () => {
  await saveProgress("book-1", {
    cfi: "epubcfi(/6/2!/4/1:0)",
    progress: 0.42,
    spineItemId: "chapter-3",
    textQuote: "Morgan’s head was pressed against her pillow.",
  });
  await expect(getProgress("book-1")).resolves.toMatchObject({
    spineItemId: "chapter-3",
    textQuote: expect.stringContaining("Morgan"),
    updatedAt: expect.any(Number),
  });
});

it("shows a continue reading surface for the most recently read book", async () => {
  render(<BookshelfPage />);
  expect(await screen.findByRole("button", { name: /continue reading/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run src/features/bookshelf/BookshelfPage.test.tsx`

Expected: FAIL because progress records do not yet carry fallback metadata and the bookshelf has no continue reading section.

- [ ] **Step 3: Write the minimal implementation**

Update:

- progress types to include `spineItemId`, `textQuote`, and `updatedAt`
- `saveProgress()` to persist the richer shape
- `epubRuntime.ts` and `EpubViewport.tsx` to capture a nearby text quote during relocations
- reopen logic to attempt:
  1. saved `CFI`
  2. saved `spineItemId`
  3. nearby `textQuote` fallback
- `BookshelfPage.tsx` to render a `Continue reading` section using the most recently updated progress record

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx vitest run src/features/bookshelf/BookshelfPage.test.tsx`

Run: `npx playwright test tests/e2e/bookshelf.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/books.ts src/features/bookshelf/progressRepository.ts src/features/reader/EpubViewport.tsx src/features/reader/epubRuntime.ts src/features/bookshelf/BookshelfPage.tsx src/features/bookshelf/BookshelfPage.test.tsx tests/e2e/bookshelf.spec.ts
git commit -m "feat: strengthen reading progress recovery"
```

## Chunk 5: Full Verification

### Task 5: Run full regression verification

**Files:**
- No code changes

- [ ] **Step 1: Run the full unit and integration suite**

Run: `npx vitest run`

Expected: PASS

- [ ] **Step 2: Run the browser suite**

Run: `npx playwright test`

Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: build succeeds

- [ ] **Step 4: Check for remaining obsolete localhost TTS references**

Run: `rg -n "43115|ttsHelperUrl|localTtsClient|kokoro_tts_service|qwen3_tts_service" src tests scripts tts || true`

Expected: no active-code matches

- [ ] **Step 5: Confirm working tree state**

Run: `git status --short`

Expected: no unexpected tracked changes remain
