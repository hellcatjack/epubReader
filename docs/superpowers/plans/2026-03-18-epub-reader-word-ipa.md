# EPUB Reader Word IPA Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show IPA in the Translation panel whenever the user selects a single English word.

**Architecture:** Add a small front-end `phoneticsService` that determines whether a selection is IPA-eligible, looks up the best phonetic transcription from `dictionaryapi.dev`, and caches results in memory. Reuse the existing Reader selection flow so translation remains the primary path, while IPA is fetched in parallel and rendered as optional metadata in the existing AI result panel.

**Tech Stack:** React 19, TypeScript, Vite, browser `fetch`, Vitest, Testing Library, Playwright.

---

## File Structure

### Existing Files to Modify

- `src/features/reader/ReaderPage.tsx`
  - Trigger IPA lookups alongside translation, keep IPA state synchronized with selection changes, and clear stale IPA when selection is ineligible.
- `src/features/reader/panels/AiResultPanel.tsx`
  - Render an optional IPA row in the Translation panel.
- `src/features/reader/selectionActions.test.tsx`
  - Cover single-word IPA rendering, multi-word no-IPA behavior, and stale-response protection.
- `tests/e2e/ai-actions.spec.ts`
  - Cover visible IPA rendering for a single-word selection and absence for multi-word selection.

### New Files to Create

- `src/features/reader/phoneticsService.ts`
  - Selection eligibility checks, dictionary lookup, IPA extraction, normalization, and cache.
- `src/features/reader/phoneticsService.test.ts`
  - Focused unit tests for eligibility, extraction, normalization, caching, and failure handling.

### Existing Files Likely Unchanged

- `src/features/ai/aiService.ts`
  - Keep translation and explanation behavior unchanged.
- `src/features/reader/RightPanel.tsx`
  - Continue passing result data into `AiResultPanel`; avoid adding new layout logic unless required.
- `src/features/reader/reader.css`
  - Only touch if a minimal IPA display style hook is truly needed.

## Chunk 1: IPA Lookup Service

### Task 1: Add the phonetics service with tight unit coverage

**Files:**
- Create: `src/features/reader/phoneticsService.ts`
- Create: `src/features/reader/phoneticsService.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Add tests in `src/features/reader/phoneticsService.test.ts` for:

- `isEligibleWordSelection("pressed")` returns the normalized word
- apostrophe and hyphen words remain eligible
- multi-word, punctuation-only, and mixed phrase selections are rejected
- IPA extraction prefers `phonetics[].text` before top-level `phonetic`
- duplicate word lookups reuse the in-memory cache
- lookup failures resolve to `null` instead of throwing

Suggested cases:

```ts
it("accepts a single english word and normalizes casing", () => {
  expect(getEligibleIpaWord("Pressed")).toBe("pressed");
});

it("rejects phrases and punctuation-only selections", () => {
  expect(getEligibleIpaWord("The thing")).toBeNull();
  expect(getEligibleIpaWord("...")).toBeNull();
});

it("prefers phonetics text when extracting ipa", () => {
  expect(extractIpaFromEntries([{ phonetics: [{ text: "/prest/" }], phonetic: "/legacy/" }])).toBe("/prest/");
});
```

- [ ] **Step 2: Run the unit tests and verify failure**

Run:

```bash
npx vitest run src/features/reader/phoneticsService.test.ts
```

Expected:
- FAIL because the phonetics service does not exist yet.

- [ ] **Step 3: Implement the minimal phonetics service**

Create `src/features/reader/phoneticsService.ts` with:

- a selection gate such as `getEligibleIpaWord(selectionText: string): string | null`
- `extractIpaFromEntries(entries): string | null`
- `createPhoneticsService({ fetchImpl })`
- in-memory cache keyed by normalized lowercase word
- a `lookupIpa(word)` method that:
  - calls `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  - returns the best IPA string or `null`
  - swallows network failures into `null`

Recommended shape:

```ts
export function getEligibleIpaWord(text: string) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!/^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(normalized)) {
    return null;
  }
  return normalized.toLowerCase();
}
```

- [ ] **Step 4: Re-run the unit tests**

Run:

```bash
npx vitest run src/features/reader/phoneticsService.test.ts
```

Expected:
- PASS with the new service behavior.

- [ ] **Step 5: Commit the service layer**

Run:

```bash
git add src/features/reader/phoneticsService.ts src/features/reader/phoneticsService.test.ts
git commit -m "feat: add ipa lookup service"
```

## Chunk 2: Reader and Translation Panel Integration

### Task 2: Show IPA only for eligible single-word selections

**Files:**
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/panels/AiResultPanel.tsx`
- Modify: `src/features/reader/selectionActions.test.tsx`

- [ ] **Step 1: Write the failing integration tests**

Add tests in `src/features/reader/selectionActions.test.tsx` that assert:

- a released single-word selection triggers translation and displays IPA
- a multi-word selection displays translation but no IPA
- stale IPA lookups are ignored when a new selection replaces the previous one

Suggested pattern:

```tsx
it("shows ipa for a single-word selection", async () => {
  render(<ReaderPage ai={ai} />);
  act(() => {
    selectionBridge.publish({ text: "pressed", spineItemId: "chap-1", cfiRange: "..." });
  });

  expect(await screen.findByText(/IPA:/i)).toHaveTextContent("/prest/");
});
```

- [ ] **Step 2: Run the reader integration tests and verify failure**

Run:

```bash
npx vitest run src/features/reader/selectionActions.test.tsx
```

Expected:
- FAIL because the translation panel has no IPA support yet.

- [ ] **Step 3: Implement the minimal reader integration**

Update `src/features/reader/ReaderPage.tsx` to:

- add local state for optional IPA text
- create or import a shared `phoneticsService`
- inside the released-selection effect:
  - compute eligible word
  - clear IPA immediately for ineligible selections
  - request IPA in parallel for eligible words
  - guard updates with the same request-version/stale-response pattern used for translation

Update `src/features/reader/panels/AiResultPanel.tsx` to accept:

- `ipa?: string`

and render:

- `Selection: <word>`
- `IPA: /.../` when present
- translation result below

Keep IPA hidden for:

- non-word selections
- failed dictionary lookups
- explanation mode

- [ ] **Step 4: Re-run the reader integration tests**

Run:

```bash
npx vitest run src/features/reader/selectionActions.test.tsx
```

Expected:
- PASS with IPA rendered only in the correct word-selection cases.

- [ ] **Step 5: Commit the reader integration**

Run:

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/panels/AiResultPanel.tsx src/features/reader/selectionActions.test.tsx
git commit -m "feat: show ipa for single-word translations"
```

## Chunk 3: Browser Regression Coverage

### Task 3: Verify IPA behavior in the real reader flow

**Files:**
- Modify: `tests/e2e/ai-actions.spec.ts`

- [ ] **Step 1: Write the failing browser test updates**

Update `tests/e2e/ai-actions.spec.ts` to:

- intercept `dictionaryapi.dev` IPA requests
- select a single word in the iframe and verify the `AI result` panel shows an `IPA` row
- select multiple words and verify the `IPA` row disappears while translation still updates

Suggested route stub:

```ts
await page.route("https://api.dictionaryapi.dev/api/v2/entries/en/*", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([{ phonetics: [{ text: "/prest/" }] }]),
  });
});
```

- [ ] **Step 2: Run the browser test and verify failure**

Run:

```bash
npx playwright test tests/e2e/ai-actions.spec.ts
```

Expected:
- FAIL because IPA is not currently shown.

- [ ] **Step 3: Adjust browser assertions after implementation**

Once the reader changes are in place, ensure the browser test asserts:

- `Selection: pressed`
- `IPA: /prest/`
- translated text is still visible
- IPA is absent for a two-word selection

- [ ] **Step 4: Re-run the targeted browser test**

Run:

```bash
npx playwright test tests/e2e/ai-actions.spec.ts
```

Expected:
- PASS with visible IPA for single-word selection only.

- [ ] **Step 5: Commit the browser coverage**

Run:

```bash
git add tests/e2e/ai-actions.spec.ts
git commit -m "test: cover word ipa translation flow"
```

## Chunk 4: Final Verification

### Task 4: Run the full regression suite

**Files:**
- No new code changes expected

- [ ] **Step 1: Run the full unit/integration suite**

Run:

```bash
npx vitest run
```

Expected:
- PASS with the new phonetics service and reader integration tests included.

- [ ] **Step 2: Run the full browser suite**

Run:

```bash
npx playwright test
```

Expected:
- PASS with the new IPA browser coverage included.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected:
- production build succeeds

- [ ] **Step 4: Confirm the working tree only contains expected leftovers**

Run:

```bash
git status --short
```

Expected:
- only pre-existing untracked workspace files remain

## Notes for the Implementer

- Keep IPA lookup failures silent; do not add a new reader-side error banner for them.
- Do not move IPA into the main reader canvas or selection popover.
- Avoid over-parsing dictionary payloads; only extract enough to show a stable display string.
- Reuse existing stale-request protection patterns from `ReaderPage` rather than inventing a parallel state machine.

Plan complete and saved to `docs/superpowers/plans/2026-03-18-epub-reader-word-ipa.md`. Ready to execute?
