# Project Cleanup And Dead Code Pruning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove obsolete spike assets, dead helpers, and the legacy viewport controller path while keeping the shipped reader behavior unchanged.

**Architecture:** Tighten the codebase around one reader opening path: `epubViewportRuntime`. Delete obsolete files instead of hiding them, and update tests so cleanup is verified by product behavior rather than by file inspection.

**Tech Stack:** React, TypeScript, Vitest, Vite, Playwright, static SPA deploy via `rsync`

---

### Task 1: Lock Cleanup Boundaries With Tests

**Files:**
- Modify: `src/app/App.test.tsx`
- Modify: `src/features/reader/EpubViewport.test.tsx`

- [ ] **Step 1: Write a failing route test**

Add a test that renders the app at `/spike/openai` and verifies the old spike UI is not exposed anymore.

- [ ] **Step 2: Run the route test to confirm RED**

Run: `npm test -- src/app/App.test.tsx`

- [ ] **Step 3: Replace the controller-only viewport fallback test**

Update the controller-based fallback test in `src/features/reader/EpubViewport.test.tsx` so it asserts the runtime-only path falls back from an invalid saved CFI to chapter start.

- [ ] **Step 4: Run the viewport test to confirm RED**

Run: `npm test -- src/features/reader/EpubViewport.test.tsx`

### Task 2: Remove Obsolete Runtime And Spike Code

**Files:**
- Delete: `src/features/ai/OpenAISpikePage.tsx`
- Delete: `src/features/tts/audioPlayer.ts`
- Delete: `src/features/reader/readerController.ts`
- Delete: `src/features/reader/readerController.test.ts`
- Modify: `src/app/router.tsx`
- Modify: `src/features/reader/EpubViewport.tsx`

- [ ] **Step 1: Remove the spike route and page**
- [ ] **Step 2: Remove the unused audio player helper**
- [ ] **Step 3: Remove the legacy reader controller implementation and test**
- [ ] **Step 4: Simplify `EpubViewport` to the runtime-only code path**

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/app/App.test.tsx src/features/reader/EpubViewport.test.tsx`

### Task 3: Update Docs To Match Current Product Reality

**Files:**
- Modify: `README.md`
- Delete: `docs/feasibility/openai-browser-spike.md`

- [ ] **Step 1: Remove the outdated feasibility wording from the README**
- [ ] **Step 2: Delete the stale feasibility spike note**
- [ ] **Step 3: Re-read the README and confirm it only describes current flows**

### Task 4: Verify And Publish

**Files:**
- Modify: only the files above

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

- [ ] **Step 2: Run the production build**

Run: `npm run build`

- [ ] **Step 3: Publish the static app**

Run: `rsync -a --delete dist/ /app/epubReader/`

- [ ] **Step 4: Inspect git status**

Run: `git status --short`

