# Contextual Selection Translation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make selection translation use the current sentence as context so single words and phrases are translated according to their meaning in the active sentence.

**Architecture:** Extend the EPUB selection payload with a sentence-level context string extracted from the rendered DOM range. Thread that context through the reader selection bridge into the AI translation request, and switch the translation prompt to a contextual variant when sentence context is available while preserving the current fallback path.

**Tech Stack:** React 19, TypeScript, Vitest, epub.js

---

## Chunk 1: Selection Context Extraction

### Task 1: Add failing runtime tests for sentence extraction

**Files:**
- Modify: `src/features/reader/epubRuntime.test.ts`
- Modify: `src/features/reader/epubRuntime.ts`

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run `npm test -- src/features/reader/epubRuntime.test.ts` to verify failure**
- [ ] **Step 3: Implement minimal sentence extraction helpers in `epubRuntime.ts`**
- [ ] **Step 4: Re-run `npm test -- src/features/reader/epubRuntime.test.ts` and verify pass**

### Task 2: Thread sentence context through selection payloads

**Files:**
- Modify: `src/features/reader/epubRuntime.ts`
- Modify: `src/features/reader/selectionBridge.ts`
- Modify: `src/features/reader/EpubViewport.tsx`

- [ ] **Step 1: Extend the selection payload type with `sentenceContext`**
- [ ] **Step 2: Populate `sentenceContext` from runtime selection handling**
- [ ] **Step 3: Keep fallback behavior when context extraction fails**
- [ ] **Step 4: Re-run affected tests**

## Chunk 2: Contextual Translation Requests

### Task 3: Add failing AI adapter tests for contextual translation prompts

**Files:**
- Modify: `src/features/ai/openaiAdapter.test.ts`
- Modify: `src/features/ai/openaiAdapter.ts`
- Modify: `src/features/ai/aiService.ts`

- [ ] **Step 1: Write failing tests for contextual translate prompt content**
- [ ] **Step 2: Run `npm test -- src/features/ai/openaiAdapter.test.ts` to verify failure**
- [ ] **Step 3: Implement contextual translate prompt handling with fallback**
- [ ] **Step 4: Re-run `npm test -- src/features/ai/openaiAdapter.test.ts` and verify pass**

### Task 4: Add failing reader tests for context plumbing

**Files:**
- Modify: `src/features/reader/selectionActions.test.tsx`
- Modify: `src/features/reader/ReaderPage.tsx`

- [ ] **Step 1: Write failing tests asserting `sentenceContext` reaches `translateSelection`**
- [ ] **Step 2: Run `npm test -- src/features/reader/selectionActions.test.tsx` to verify failure**
- [ ] **Step 3: Implement minimal `ReaderPage` translation plumbing**
- [ ] **Step 4: Re-run `npm test -- src/features/reader/selectionActions.test.tsx` and verify pass**

## Chunk 3: Final Verification

### Task 5: Run full verification and deploy

**Files:**
- Verify only

- [ ] **Step 1: Run `npm test`**
- [ ] **Step 2: Run `npm run build`**
- [ ] **Step 3: Run `rsync -a --delete dist/ /app/epubReader/`**
