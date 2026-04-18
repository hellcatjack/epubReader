# Selection Auto-Read Threshold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop automatic browser read aloud for released mouse selections once the selection contains more than 30 English letters, while preserving automatic translation.

**Architecture:** Keep the change inside the existing released-selection auto-read branch in `ReaderPage.tsx`. Add a tiny helper for counting ASCII letters, then gate the existing `isAutoSpeakableSelection` decision with a `<= 30` threshold so manual read actions remain untouched.

**Tech Stack:** React, TypeScript, Vitest, Testing Library

---

### Task 1: Lock the behavior with failing selection-action tests

**Files:**
- Modify: `src/features/reader/selectionActions.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add one regression asserting a `31`-letter selection still auto-translates but never calls `speechSynthesis.speak`, and one boundary test asserting a `30`-letter selection still auto-reads.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/reader/selectionActions.test.tsx -t "does not auto-read released selections with more than 30 English letters|still auto-reads released selections with exactly 30 English letters"`
Expected: FAIL because the current code still auto-reads both selections.

### Task 2: Implement the threshold in the released-selection auto-read branch

**Files:**
- Modify: `src/features/reader/ReaderPage.tsx`

- [ ] **Step 1: Add a helper that counts English letters**

Add a local helper using `/[A-Za-z]/g` and return the matched count.

- [ ] **Step 2: Gate only the auto-read branch**

Update the released-selection auto-read condition so selections remain auto-speakable only when they already pass `isAutoSpeakableSelection(text)` and contain at most `30` English letters.

- [ ] **Step 3: Leave manual read aloud untouched**

Do not change `handleReadAloud`, `startSelectionSpeech` itself, or continuous TTS entry points.

### Task 3: Verify, build, and deploy

**Files:**
- Verify: `src/features/reader/selectionActions.test.tsx`
- Verify: `src/features/reader/ReaderPage.tsx`

- [ ] **Step 1: Run the targeted tests**

Run: `npm run test -- src/features/reader/selectionActions.test.tsx -t "does not auto-read released selections with more than 30 English letters|still auto-reads released selections with exactly 30 English letters"`
Expected: PASS

- [ ] **Step 2: Run the full unit suite**

Run: `npm run test`
Expected: PASS with all tests green

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Deploy the static app**

Run: `rsync -a --delete dist/ /app/epubReader/`
Expected: exit code `0`
