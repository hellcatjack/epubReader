# EPUB Reader Shared Translation and Explanation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep local-LLM translation and explanation, but show them together in one stable AI card instead of replacing one another.

**Architecture:** Split the reader-side AI state into independent translation and explanation slots while keeping request timing in `ReaderPage.tsx`. Turn `AiResultPanel.tsx` into a pure presentation component with fixed sections for metadata, translation, and explanation, then verify both component and browser flows.

**Tech Stack:** React, TypeScript, Vitest, React Testing Library, Playwright, Vite

---

## File Map

- Modify: `src/features/reader/ReaderPage.tsx`
  - Replace the single `aiTitle/aiResult/aiError` state model with section-specific translation and explanation state.
- Modify: `src/features/reader/panels/AiResultPanel.tsx`
  - Render a stable assistant card with metadata, translation, explanation, and section-scoped empty/error states.
- Modify: `src/features/reader/reader.css`
  - Style the additional explanation section so it remains readable but visually secondary to translation.
- Modify: `src/features/reader/panels/AiResultPanel.test.tsx`
  - Lock the additive card structure and explanation placeholder behavior.
- Modify: `src/features/reader/selectionActions.test.tsx`
  - Verify auto-translate keeps translation visible and manual explain adds explanation without clearing it.
- Modify: `tests/e2e/ai-actions.spec.ts`
  - Verify IPA, translation, and explanation can coexist in the real browser flow.

## Chunk 1: Additive AI Panel Structure

### Task 1: Write failing component coverage for shared translation/explanation surfaces

**Files:**
- Modify: `src/features/reader/panels/AiResultPanel.test.tsx`
- Modify: `src/features/reader/panels/AiResultPanel.tsx`
- Modify: `src/features/reader/reader.css`

- [ ] **Step 1: Extend the component test with the new target behavior**

```tsx
it("renders translation and explanation sections together", () => {
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

it("shows an explanation placeholder before explain is requested", () => {
  render(<AiResultPanel selectedText="pressed" ipa="/prest/" translation="按压" />);

  expect(screen.getByText("Click Explain for deeper context.")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the component test to verify it fails**

Run: `npx vitest run src/features/reader/panels/AiResultPanel.test.tsx`

Expected: FAIL because `AiResultPanel` still only accepts `title/result/error`.

- [ ] **Step 3: Implement the new panel API and markup**

```tsx
type AiResultPanelProps = {
  selectedText?: string;
  ipa?: string;
  translation?: string;
  translationError?: string;
  explanation?: string;
  explanationError?: string;
};

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

- [ ] **Step 4: Add only the minimal CSS needed for the second surface**

```css
.reader-ai-surface {
  display: grid;
  gap: 0.5rem;
  padding: 1rem 1.05rem;
  border-radius: 1rem;
}

.reader-ai-surface-primary { ... }
.reader-ai-surface-secondary { ... }
.reader-ai-surface h3 { ... }
.reader-ai-placeholder { ... }
```

Keep the existing metadata styling. Do not redesign the whole rail again.

- [ ] **Step 5: Re-run the component test**

Run: `npx vitest run src/features/reader/panels/AiResultPanel.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/reader/panels/AiResultPanel.tsx src/features/reader/panels/AiResultPanel.test.tsx src/features/reader/reader.css
git commit -m "feat: show translation and explanation together"
```

## Chunk 2: Reader State Split and Interaction Flow

### Task 2: Replace the single AI result state with translation/explanation slots

**Files:**
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/selectionActions.test.tsx`

- [ ] **Step 1: Add failing integration tests that capture the new behavior**

Extend `src/features/reader/selectionActions.test.tsx` with assertions like:

```tsx
expect(await screen.findByText("你好，世界")).toBeInTheDocument();

await user.click(screen.getByRole("button", { name: /explain/i }));

expect(await screen.findByText("A short contextual explanation")).toBeInTheDocument();
expect(screen.getByText("你好，世界")).toBeInTheDocument();
expect(screen.getByText("Click Explain for deeper context.")).not.toBeInTheDocument();
```

Also add a failure-path assertion:

```tsx
expect(screen.getByText("按压")).toBeInTheDocument();
expect(screen.getByText(/Explain failed:/)).toBeInTheDocument();
```

- [ ] **Step 2: Run the integration test to verify it fails**

Run: `npx vitest run src/features/reader/selectionActions.test.tsx`

Expected: FAIL because `Explain` still overwrites the translation result.

- [ ] **Step 3: Implement the minimal reader-state split**

Replace:

```tsx
const [aiResult, setAiResult] = useState("");
const [aiTitle, setAiTitle] = useState("AI result");
const [aiError, setAiError] = useState("");
```

with independent state:

```tsx
const [translation, setTranslation] = useState("");
const [translationError, setTranslationError] = useState("");
const [explanation, setExplanation] = useState("");
const [explanationError, setExplanationError] = useState("");
```

Behavior rules:

- new released selection:
  - clear `translation`, `translationError`, `explanation`, `explanationError`, `ipa`
  - request translation
- successful translation:
  - set only `translation`
- `Explain` click:
  - clear only `explanation` and `explanationError`
  - preserve `translation`
- explanation failure:
  - set only `explanationError`

- [ ] **Step 4: Wire the new props into `AiResultPanel`**

```tsx
<RightPanel
  aiIpa={aiIpa}
  explanation={explanation}
  explanationError={explanationError}
  selectedText={selectedText}
  translation={translation}
  translationError={translationError}
  ...
/>
```

and pass them through `RightPanel.tsx` without adding logic there.

- [ ] **Step 5: Re-run the integration test**

Run: `npx vitest run src/features/reader/selectionActions.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/selectionActions.test.tsx src/features/reader/RightPanel.tsx
git commit -m "feat: preserve translation when loading explanation"
```

## Chunk 3: Browser Flow and Release

### Task 3: Verify IPA, translation, and explanation coexist in the browser

**Files:**
- Modify: `tests/e2e/ai-actions.spec.ts`

- [ ] **Step 1: Add the failing browser assertions**

Update the existing E2E flow with assertions like:

```ts
await expect(page.locator(".reader-ai-surface-primary")).toContainText("中文翻译");
await expect(page.locator(".reader-ai-surface-secondary")).toContainText("Click Explain for deeper context.");

await page.getByRole("button", { name: "Explain" }).click();

await expect(page.locator(".reader-ai-surface-primary")).toContainText("中文翻译");
await expect(page.locator(".reader-ai-surface-secondary")).toContainText("中文解释");
await expect(page.locator(".reader-ai-surface-secondary")).toContainText("English explanation");
```

- [ ] **Step 2: Run the browser test to verify it fails**

Run: `npx playwright test tests/e2e/ai-actions.spec.ts`

Expected: FAIL until the browser flow matches the new additive layout.

- [ ] **Step 3: Make the minimal markup/class adjustments**

If needed, add only the class names and ARIA labels required for stable browser assertions:

```tsx
<section className="reader-ai-surface reader-ai-surface-primary" ... />
<section className="reader-ai-surface reader-ai-surface-secondary" ... />
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

- [ ] **Step 6: Verify the deployed site responds**

Run:

```bash
curl --resolve ushome.amycat.com:18025:127.0.0.1 -I https://ushome.amycat.com:18025/
curl --resolve ushome.amycat.com:18025:127.0.0.1 -I https://ushome.amycat.com:18025/books/demo
```

Expected: both return `HTTP/2 200`

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/ai-actions.spec.ts
git commit -m "test: cover shared translation and explanation panel"
```
