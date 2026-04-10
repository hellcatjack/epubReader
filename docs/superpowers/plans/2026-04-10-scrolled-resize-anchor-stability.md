# Scrolled Resize Anchor Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate `scrolled mode` reading-position drift during repeated browser resize, especially for Bible EPUBs with inline verse markers.

**Architecture:** Fix the runtime's scrolled anchor restoration first, then let the viewport layer perform semantic recovery only when resize relocates the user to a different passage. Avoid blind proportional `scrollTop` rewrites.

**Tech Stack:** TypeScript, React, Vitest, Vite, Playwright

---

### Task 1: Lock The Bible Repro Into Regression Tests

**Files:**
- Modify: `src/features/reader/epubRuntime.test.ts`
- Modify: `src/features/reader/EpubViewport.test.tsx`

- [ ] **Step 1: Add runtime coverage for scrolled anchor resolution**

Verify:

- scrolled anchor top restoration keeps chapter coordinates intact
- truncated normalized Bible quotes can still resolve back to the original paragraph

- [ ] **Step 2: Add viewport coverage for resize recovery**

Verify:

- no scrolled recovery `goTo()` fires when resize stays on the same passage
- a recovery `goTo()` does fire when resize drifts to a different passage

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- src/features/reader/epubRuntime.test.ts src/features/reader/EpubViewport.test.tsx
```

Expected: failing tests before the fixes are applied.

### Task 2: Fix Runtime Scrolled Anchor Recovery

**Files:**
- Modify: `src/features/reader/epubRuntime.ts`
- Test: `src/features/reader/epubRuntime.test.ts`

- [ ] **Step 1: Normalize scrolled anchor coordinate handling**

Keep scrolled anchor tops in chapter-document coordinates instead of reapplying iframe/container offsets.

- [ ] **Step 2: Add a scrolled-specific text-anchor resolver**

Use strict exact matching first, then a strict prefix fallback for normalized saved quotes that no longer contain inline marker nodes.

- [ ] **Step 3: Run runtime tests**

Run:

```bash
npm test -- src/features/reader/epubRuntime.test.ts
```

Expected: PASS

### Task 3: Fix Viewport Resize Recovery

**Files:**
- Modify: `src/features/reader/EpubViewport.tsx`
- Test: `src/features/reader/EpubViewport.test.tsx`

- [ ] **Step 1: Track the last stable scrolled passage**

Record the last stable `cfi` and `textQuote` from scrolled relocations.

- [ ] **Step 2: Replace proportional fallback with semantic recovery**

On resize:

- snapshot the last stable passage
- wait for relocation to settle
- if the current passage drifted, recover with `goTo(lastStableCfi)`
- if the passage stayed stable, do nothing

- [ ] **Step 3: Run viewport tests**

Run:

```bash
npm test -- src/features/reader/EpubViewport.test.tsx
```

Expected: PASS

### Task 4: Verify, Browser-Test, And Publish

**Files:**
- Verify: `src/features/reader/epubRuntime.ts`
- Verify: `src/features/reader/EpubViewport.tsx`
- Verify: `docs/superpowers/specs/2026-04-10-scrolled-resize-anchor-stability-design.md`
- Verify: `docs/superpowers/plans/2026-04-10-scrolled-resize-anchor-stability.md`

- [ ] **Step 1: Run focused verification**

Run:

```bash
npm test -- src/features/reader/epubRuntime.test.ts src/features/reader/EpubViewport.test.tsx src/features/reader/ReaderPage.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS

- [ ] **Step 3: Publish the frontend**

Run:

```bash
rsync -a --delete dist/ /app/epubReader/
```

Expected: PASS

- [ ] **Step 4: Browser-verify the original repro**

Verify with the Bible EPUB in `scrolled mode` that repeated viewport toggles do not drift from the same verse paragraph or rewrite progress to headings or chapter navigation.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-10-scrolled-resize-anchor-stability-design.md \
  docs/superpowers/plans/2026-04-10-scrolled-resize-anchor-stability.md \
  src/features/reader/epubRuntime.ts \
  src/features/reader/epubRuntime.test.ts \
  src/features/reader/EpubViewport.tsx \
  src/features/reader/EpubViewport.test.tsx
git commit -m "fix: stabilize scrolled resize reading anchors"
```
