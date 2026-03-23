# EPUB Reader Width and Translation UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align `scrolled` reader width with `paginated` book-page width and redesign the `Translation` panel into a clearer metadata-plus-result card.

**Architecture:** Keep this as a pure reader-surface refinement. `reader.css` owns width and visual styling, `AiResultPanel.tsx` owns the new semantic markup, and browser tests verify that both modes render the same prose measure while the Translation card remains readable.

**Tech Stack:** React, TypeScript, Vitest, React Testing Library, Playwright, Vite

---

## File Map

- Modify: `src/features/reader/panels/AiResultPanel.tsx`
  - Restructure panel markup into heading, metadata cluster, primary result surface, and optional error surface.
- Create: `src/features/reader/panels/AiResultPanel.test.tsx`
  - Focused component coverage for Translation card hierarchy and optional IPA rendering.
- Modify: `src/features/reader/reader.css`
  - Apply shared prose width rules across `scrolled` and `paginated`, plus new Translation card styling.
- Modify: `src/features/reader/RightPanel.tsx`
  - Keep prop wiring stable while ensuring the updated Translation panel sits cleanly in the right rail.
- Modify: `tests/e2e/reader-modes.spec.ts`
  - Replace the old “paginated is half width” assertion with a shared-width assertion for prose pages.
- Modify: `tests/e2e/ai-actions.spec.ts`
  - Verify metadata card structure and visible Translation result block in browser flow.

## Chunk 1: Translation Card Markup and Styling

### Task 1: Lock the Translation card structure with a focused component test

**Files:**
- Create: `src/features/reader/panels/AiResultPanel.test.tsx`
- Modify: `src/features/reader/panels/AiResultPanel.tsx`
- Modify: `src/features/reader/reader.css`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiResultPanel } from "./AiResultPanel";

describe("AiResultPanel", () => {
  it("renders translation metadata and result in separate surfaces", () => {
    render(
      <AiResultPanel
        title="Translation"
        selectedText="pressed"
        ipa="/prest/"
        result="按压的；紧迫的。"
      />,
    );

    const panel = screen.getByLabelText("AI result");
    expect(panel.querySelector(".reader-ai-meta")).not.toBeNull();
    expect(panel.querySelector(".reader-ai-result")).not.toBeNull();
    expect(screen.getByText("Selection")).toBeInTheDocument();
    expect(screen.getByText("IPA")).toBeInTheDocument();
  });

  it("omits the ipa row for non-single-word translation results", () => {
    render(
      <AiResultPanel
        title="Translation"
        selectedText="pressed flowers"
        result="压制花"
      />,
    );

    expect(screen.queryByText("IPA")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reader/panels/AiResultPanel.test.tsx`

Expected: FAIL because `.reader-ai-meta` and `.reader-ai-result` markup do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```tsx
export function AiResultPanel(...) {
  const isTranslation = title === "Translation";

  return (
    <section className="reader-panel reader-ai-panel" aria-label="AI result">
      <h2>{title}</h2>
      <div className="reader-ai-meta">
        {selectedText ? (
          <div className="reader-ai-meta-row">
            <span className="reader-ai-label">Selection</span>
            <span className="reader-ai-value">{selectedText}</span>
          </div>
        ) : null}
        {isTranslation && ipa ? (
          <div className="reader-ai-meta-row">
            <span className="reader-ai-label">IPA</span>
            <span className="reader-ai-value">{ipa}</span>
          </div>
        ) : null}
      </div>
      <div className="reader-ai-result">
        <p>{result ?? "Select text to translate or explain it in context."}</p>
      </div>
      {error ? <p className="reader-ai-error">{error}</p> : null}
    </section>
  );
}
```

- [ ] **Step 4: Add the card styling**

```css
.reader-ai-panel {
  display: grid;
  gap: 0.9rem;
}

.reader-ai-meta {
  display: grid;
  gap: 0.65rem;
  padding: 0.85rem 0.95rem;
  border-radius: 0.95rem;
  border: 1px solid rgba(79, 49, 24, 0.12);
  background: rgba(248, 241, 231, 0.92);
}

.reader-ai-meta-row {
  display: grid;
  gap: 0.25rem;
}

.reader-ai-label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
  color: #8a6647;
}

.reader-ai-value {
  color: #2d1b10;
  font-weight: 600;
  word-break: break-word;
}

.reader-ai-result {
  padding: 1rem 1.05rem;
  border-radius: 1rem;
  border: 1px solid rgba(79, 49, 24, 0.12);
  background: rgba(255, 253, 249, 0.96);
}

.reader-ai-result p {
  white-space: pre-wrap;
  line-height: 1.7;
  color: #402d20;
}
```

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run src/features/reader/panels/AiResultPanel.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/reader/panels/AiResultPanel.tsx src/features/reader/panels/AiResultPanel.test.tsx src/features/reader/reader.css
git commit -m "feat: redesign translation result card"
```

## Chunk 2: Shared Reader Width Across Modes

### Task 2: Lock width parity between scrolled and paginated prose pages

**Files:**
- Modify: `src/features/reader/reader.css`
- Modify: `tests/e2e/reader-modes.spec.ts`

- [ ] **Step 1: Write the failing browser assertion**

```ts
test("scrolled and paginated prose pages use the same visible page width", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/");
  await page.setInputFiles("input[type=file]", fixturePath);
  await expect(page).toHaveURL(/\/books\//);

  const scrolledWidth = await page.locator(".epub-root").evaluate((node) => node.getBoundingClientRect().width);

  await page.getByRole("button", { name: /paginated mode/i }).click();
  await expect(page.locator(".epub-root")).toHaveAttribute("data-reader-mode", "paginated");

  const paginatedWidth = await page.locator(".epub-root").evaluate((node) => node.getBoundingClientRect().width);

  expect(Math.abs(scrolledWidth - paginatedWidth)).toBeLessThan(8);
});
```

- [ ] **Step 2: Run the browser test to verify it fails**

Run: `npx playwright test tests/e2e/reader-modes.spec.ts --grep "same visible page width"`

Expected: FAIL because `scrolled` is still wider than `paginated`.

- [ ] **Step 3: Implement the shared width rule**

```css
.epub-root[data-reader-page-kind="prose"] {
  width: min(50%, 46rem);
}

@media (max-width: 1100px) {
  .epub-root[data-reader-page-kind="prose"] {
    width: 100%;
  }
}
```

Apply this rule so both `scrolled` and `paginated` prose pages use the same centered book width, while image pages keep their wider treatment.

- [ ] **Step 4: Run the browser test to verify it passes**

Run: `npx playwright test tests/e2e/reader-modes.spec.ts --grep "same visible page width"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/reader.css tests/e2e/reader-modes.spec.ts
git commit -m "feat: align prose width across reader modes"
```

## Chunk 3: Full Reader Regression and Release

### Task 3: Verify translation readability in the live reader flow

**Files:**
- Modify: `tests/e2e/ai-actions.spec.ts`
- Modify: `src/features/reader/RightPanel.tsx`

- [ ] **Step 1: Extend the browser test to assert the new Translation card surfaces**

```ts
await expect(page.locator(".reader-ai-meta")).toBeVisible();
await expect(page.locator(".reader-ai-result")).toBeVisible();
await expect(page.locator(".reader-ai-meta")).toContainText("Selection");
await expect(page.locator(".reader-ai-result")).toContainText("中文翻译");
```

- [ ] **Step 2: Run the browser test to verify it fails or is incomplete**

Run: `npx playwright test tests/e2e/ai-actions.spec.ts`

Expected: FAIL until the new markup and CSS are present in the browser flow.

- [ ] **Step 3: Make any minimal prop or class wiring adjustments**

```tsx
<AiResultPanel
  error={aiError}
  ipa={aiIpa}
  result={aiResult}
  selectedText={selectedText}
  title={aiTitle}
/>
```

Keep `RightPanel.tsx` slim. Only adjust it if the redesigned panel needs stable class placement or spacing tweaks.

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

Expected: `/app/epubReader` contains the new bundle and deployed UI matches the latest build.

- [ ] **Step 6: Commit**

```bash
git add src/features/reader/RightPanel.tsx tests/e2e/ai-actions.spec.ts
git commit -m "test: cover reader width and translation ui refresh"
```

### Task 4: Final deployment smoke check

**Files:**
- No code changes expected

- [ ] **Step 1: Verify the deployed homepage responds**

Run:

```bash
curl -k -I https://localhost:18025/
```

Expected: `HTTP/2 200`

- [ ] **Step 2: Verify the deployed reader route responds**

Run:

```bash
curl -k -I https://localhost:18025/books/demo
```

Expected: `HTTP/2 200`

- [ ] **Step 3: Record completion**

Confirm in the handoff that:
- `scrolled` and `paginated` prose widths now match
- Translation card shows metadata + primary result surfaces
- the latest build has been published to `/app/epubReader`
