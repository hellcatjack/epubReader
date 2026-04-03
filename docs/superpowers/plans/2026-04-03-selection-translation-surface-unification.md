# Selection Translation Surface Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use the right-side assistant only for single-word selections and route every multi-word+ translation through a persistent floating bubble.

**Architecture:** Keep selection classification in `ReaderPage`, clear assistant translation state immediately for multi-word selections, and reuse one translation-only bubble component for both wide and tablet layouts. Bubble lifetime is driven by user interaction instead of a timeout.

**Tech Stack:** React, TypeScript, Vitest, Playwright

---

### Task 1: Lock the new behavior with failing tests

**Files:**
- Modify: `src/features/reader/ReaderPage.test.tsx`
- Modify: `src/features/reader/selectionActions.test.tsx`
- Modify: `tests/e2e/ai-actions.spec.ts`

- [ ] Write failing tests for:
  - single-word selection keeps assistant translation
  - multi-word selection clears assistant translation and IPA
  - wide-screen multi-word selection shows the bubble and not the assistant translation
  - bubble no longer auto-dismisses on a timer
  - bubble dismisses on click or page-context change

- [ ] Run targeted tests and verify they fail for the intended missing behavior.

### Task 2: Simplify the floating bubble surface

**Files:**
- Modify: `src/features/reader/SelectionTranslationBubble.tsx`
- Modify: `src/features/reader/reader.css`

- [ ] Remove original selection text from the bubble UI.
- [ ] Keep only the Chinese translation content.
- [ ] Preserve anchor positioning behavior.

- [ ] Re-run targeted component/UI tests.

### Task 3: Unify translation routing in ReaderPage

**Files:**
- Modify: `src/features/reader/ReaderPage.tsx`

- [ ] Add a clear single-word vs multi-word selection check.
- [ ] Keep right-side translation updates only for single-word selections.
- [ ] Clear stale assistant translation and IPA immediately when a multi-word selection starts or completes.
- [ ] Replace tablet-only bubble creation with shared multi-word bubble creation for all layouts.
- [ ] Remove timer-based auto-dismiss behavior.
- [ ] Add interaction-driven bubble dismissal for click, scroll, navigation, page turn, selection clear, and mode change.

- [ ] Re-run targeted tests and make them pass.

### Task 4: Full verification and publish

**Files:**
- Verify only

- [ ] Run `npm test`
- [ ] Run `npm run e2e -- tests/e2e/ai-actions.spec.ts`
- [ ] Run `npm run build`
- [ ] Run `rsync -a --delete dist/ /app/epubReader/`

- [ ] Review UI behavior manually if needed before closing the task.
