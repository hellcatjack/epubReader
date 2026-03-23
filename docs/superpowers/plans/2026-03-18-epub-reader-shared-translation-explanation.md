# EPUB Reader Shared Translation and Explanation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep local LLM translation and explanation, but show them together in one stable AI panel instead of replacing one another.

**Architecture:** Split the current single AI result state into independent translation and explanation slots managed by `ReaderPage.tsx`. Keep `AiResultPanel.tsx` presentation-only, with fixed sections for metadata, translation, and explanation, then verify the additive behavior at component, integration, and browser levels.

**Tech Stack:** React, TypeScript, Vitest, React Testing Library, Playwright, Vite

---

## File Map

- Modify: `src/features/reader/ReaderPage.tsx`
  - Replace `aiTitle/aiResult/aiError` with independent translation and explanation state.
- Modify: `src/features/reader/RightPanel.tsx`
  - Pass the new AI props through without adding logic.
- Modify: `src/features/reader/panels/AiResultPanel.tsx`
  - Render a stable card with metadata, translation surface, explanation surface, and section-scoped empty/error states.
- Modify: `src/features/reader/reader.css`
  - Add the minimal styles needed for the second AI surface and explanation placeholder/error text.
- Modify: `src/features/reader/panels/AiResultPanel.test.tsx`
  - Lock the new panel structure and empty-state behavior.
- Modify: `src/features/reader/selectionActions.test.tsx`
  - Verify auto-translate preserves translation and Explain adds explanation without clearing it.
- Modify: `tests/e2e/ai-actions.spec.ts`
  - Verify IPA, translation, and explanation coexist in the browser flow.

## Chunk 1: Shared AI Panel Markup

### Task 1: Add failing component tests for the additive card structure

**Files:**
- Modify: `src/features/reader/panels/AiResultPanel.test.tsx`
- Modify: `src/features/reader/panels/AiResultPanel.tsx`
- Modify: `src/features/reader/reader.css`

- [ ] **Step 1: Write the failing component tests**

Extend `src/features/reader/panels/AiResultPanel.test.tsx` with:

```tsx
it("renders translation and explanation surfaces together", () => {
  render(
    <AiResultPanel
      selectedText="pressed"
      ipa="/prest/"
      translation="按压的；紧迫的。"
      explanation="中文解释：表示被压住或紧迫。\n\nEnglish explanation: describes pressure or urgency."
    />,
  );

  expect(screen.getByText("Translation")).toBeInTheDocument();
  expect(screen.getByText("Explanation")).toBeInTheDocument();
  expect(screen.getByText("按压的；紧迫的。")).toBeInTheDocument();
  expect(screen.getByText(/English explanation:/)).toBeInTheDocument();
});

it("shows an explanation placeholder before Explain is requested", () => {
  render(<AiResultPanel selectedText="pressed" ipa="/prest/" translation="按压" />);

  expect(screen.getByText("Click Explain for deeper context.")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/reader/panels/AiResultPanel.test.tsx`

Expected: FAIL because `AiResultPanel` still only accepts `title/result/error`.

- [ ] **Step 3: Write the minimal implementation**

Refactor `AiResultPanel.tsx` to this shape:

```tsx
type AiResultPanelProps = {
  selectedText?: string;
  ipa?: string;
  translation?: string;
  translationError?: string;
  explanation?: string;
  explanationError?: string;
};
```

Render:

```tsx
<section className="reader-panel reader-ai-panel" aria-label="AI result">
  <h2>Reading assistant</h2>
  <div className="reader-ai-meta">...</div>
  <section className="reader-ai-surface reader-ai-surface-primary" aria-label="Translation result">
    <h3>Translation</h3>
    ...
  </section>
  <section className="reader-ai-surface reader-ai-surface-secondary" aria-label="Explanation result">
    <h3>Explanation</h3>
    ...
  </section>
</section>
```

Rules:
- metadata remains optional
- translation surface defaults to the existing “Select text...” helper
- explanation surface defaults to `Click Explain for deeper context.`
- translation and explanation errors render only in their own surface

- [ ] **Step 4: Add the minimal CSS**

In `src/features/reader/reader.css`, add:

```css
.reader-ai-surface {
  display: grid;
  gap: 0.45rem;
  padding: 1rem 1.05rem;
  border-radius: 1rem;
  border: 1px solid rgba(79, 49, 24, 0.1);
}

.reader-ai-surface-primary { ... }
.reader-ai-surface-secondary { ... }
.reader-ai-surface h3 { ... }
.reader-ai-placeholder { ... }
.reader-ai-section-error { ... }
```

Keep translation visually stronger than explanation. Do not rework the entire right rail.

- [ ] **Step 5: Re-run the focused component test**

Run: `npx vitest run src/features/reader/panels/AiResultPanel.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/reader/panels/AiResultPanel.tsx src/features/reader/panels/AiResultPanel.test.tsx src/features/reader/reader.css
git commit -m "feat: redesign ai panel for shared translation and explanation"
```

## Chunk 2: Reader State Split

### Task 2: Replace the single AI result state with translation/explanation slots

**Files:**
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/RightPanel.tsx`
- Modify: `src/features/reader/selectionActions.test.tsx`

- [ ] **Step 1: Write the failing integration assertions**

Extend `src/features/reader/selectionActions.test.tsx` so the existing “automatically translates…” test asserts:

```tsx
expect(await screen.findByText("你好，世界")).toBeInTheDocument();
expect(screen.getByText("Click Explain for deeper context.")).toBeInTheDocument();

await user.click(screen.getByRole("button", { name: /explain/i }));

expect(await screen.findByText("A short contextual explanation")).toBeInTheDocument();
expect(screen.getByText("你好，世界")).toBeInTheDocument();
expect(screen.queryByText("Click Explain for deeper context.")).not.toBeInTheDocument();
```

Add a second assertion path for explanation failure:

```tsx
expect(screen.getByText("按压")).toBeInTheDocument();
expect(screen.getByText(/Explain failed:/)).toBeInTheDocument();
```

- [ ] **Step 2: Run the integration test to verify it fails**

Run: `npx vitest run src/features/reader/selectionActions.test.tsx`

Expected: FAIL because `requestExplanation()` still clears the translated result.

- [ ] **Step 3: Write the minimal state split**

In `ReaderPage.tsx`, replace:

```tsx
const [aiResult, setAiResult] = useState("");
const [aiTitle, setAiTitle] = useState("AI result");
const [aiError, setAiError] = useState("");
```

with:

```tsx
const [translation, setTranslation] = useState("");
const [translationError, setTranslationError] = useState("");
const [explanation, setExplanation] = useState("");
const [explanationError, setExplanationError] = useState("");
```

Behavior rules:
- new released selection:
  - clear `translation`, `translationError`, `explanation`, `explanationError`, `aiIpa`
- `requestTranslation()`:
  - set only translation state
  - leave explanation empty until user clicks `Explain`
- `requestExplanation()`:
  - clear only explanation state
  - preserve existing translation and IPA
- explanation failure:
  - set only `explanationError`
- translation failure:
  - set only `translationError`

- [ ] **Step 4: Pass the new props through `RightPanel.tsx`**

Replace:

```tsx
<AiResultPanel error={aiError} ipa={aiIpa} result={aiResult} selectedText={selectedText} title={aiTitle} />
```

with:

```tsx
<AiResultPanel
  explanation={explanation}
  explanationError={explanationError}
  ipa={aiIpa}
  selectedText={selectedText}
  translation={translation}
  translationError={translationError}
/>
```

Do not add behavior to `RightPanel`; it stays pass-through only.

- [ ] **Step 5: Re-run the integration test**

Run: `npx vitest run src/features/reader/selectionActions.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/RightPanel.tsx src/features/reader/selectionActions.test.tsx
git commit -m "feat: preserve translation while loading explanation"
```

## Chunk 3: Browser Flow and Publish

### Task 3: Verify shared translation/explanation behavior in the browser

**Files:**
- Modify: `tests/e2e/ai-actions.spec.ts`

- [ ] **Step 1: Write the failing browser assertions**

Update `tests/e2e/ai-actions.spec.ts` with:

```ts
const translationSurface = page.locator(".reader-ai-surface-primary");
const explanationSurface = page.locator(".reader-ai-surface-secondary");

await expect(translationSurface).toContainText("中文翻译");
await expect(explanationSurface).toContainText("Click Explain for deeper context.");

await page.getByRole("button", { name: "Explain" }).click();

await expect(translationSurface).toContainText("中文翻译");
await expect(explanationSurface).toContainText("中文解释");
await expect(explanationSurface).toContainText("English explanation");
```

- [ ] **Step 2: Run the browser test to verify it fails**

Run: `npx playwright test tests/e2e/ai-actions.spec.ts`

Expected: FAIL until the additive layout and shared state are wired.

- [ ] **Step 3: Make the minimal browser-facing adjustments**

Only if needed, add class names and labels required for stable assertions:

```tsx
<section className="reader-ai-surface reader-ai-surface-primary" aria-label="Translation result">
<section className="reader-ai-surface reader-ai-surface-secondary" aria-label="Explanation result">
```

- [ ] **Step 4: Run the full verification suite**

Run:

```bash
npx vitest run
npx playwright test
npm run build
```

Expected:
- Vitest PASS
- Playwright PASS
- Build succeeds

- [ ] **Step 5: Publish the frontend**

Run:

```bash
rsync -a --delete dist/ /app/epubReader/
```

Expected: `/app/epubReader` contains the latest bundle.

- [ ] **Step 6: Verify deployed routes respond**

Run:

```bash
curl -k -I https://localhost:18025/
curl -k -I https://localhost:18025/books/demo
```

Expected: both return `HTTP/2 200`

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/ai-actions.spec.ts
git commit -m "test: cover shared translation and explanation flow"
```
