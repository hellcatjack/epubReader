# Grammar Explain Prompt Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make grammar explanation output more natural, more stable on reasoning-enabled local chat endpoints, and much easier to read in the popup UI.

**Architecture:** Keep grammar explanation on the dedicated OpenAI-compatible chat-completions path, but replace the old rigid prompt with a teacher-style tagged Markdown contract, disable server-side thinking for that request, and render the tagged Markdown in a purpose-built popup surface.

**Tech Stack:** TypeScript, React 19, Vitest, Vite, OpenAI-compatible local chat endpoints

---

### Task 1: Lock The New Prompt Contract With Tests

**Files:**
- Modify: `src/features/ai/grammarExplainPrompt.test.ts`
- Modify: `src/features/ai/openaiAdapter.test.ts`
- Modify: `src/features/ai/geminiAdapter.test.ts`

- [ ] **Step 1: Assert the new teacher-style prompt shape**

Verify that the prompt:

- frames the model as a `阅读老师`
- uses `<answer>...</answer>`
- requires `## 先看整句`
- requires `## 再拆结构`
- requires `## 读起来要注意`

- [ ] **Step 2: Assert the transport payload**

Verify that local grammar explain requests:

- still use `/v1/chat/completions`
- send `chat_template_kwargs.enable_thinking: false`
- send `temperature: 0.2`
- strip `<answer>` before returning the final text

- [ ] **Step 3: Run the targeted tests**

Run:

```bash
npm test -- src/features/ai/grammarExplainPrompt.test.ts src/features/ai/openaiAdapter.test.ts src/features/ai/geminiAdapter.test.ts
```

### Task 2: Implement The New Prompt Contract

**Files:**
- Modify: `src/features/ai/grammarExplainPrompt.ts`

- [ ] **Step 1: Replace the old rigid prompt text**

Rewrite the prompt so it:

- sounds like guided reading rather than a grammar checklist
- asks for compact prose instead of exhaustive taxonomy
- keeps the three-section Markdown structure

- [ ] **Step 2: Preserve lightweight answer extraction**

Keep `extractGrammarExplainAnswer()` as a transport cleanup helper only.

- [ ] **Step 3: Re-run prompt tests**

Run:

```bash
npm test -- src/features/ai/grammarExplainPrompt.test.ts
```

### Task 3: Stabilize The Grammar Chat Request

**Files:**
- Modify: `src/features/ai/openaiAdapter.ts`

- [ ] **Step 1: Keep grammar explain on chat-completions**

Do not move grammar explain onto `/v1/completions`.

- [ ] **Step 2: Add the anti-thinking payload**

Send:

```ts
chat_template_kwargs: {
  enable_thinking: false,
}
temperature: 0.2
max_tokens: 1400
```

- [ ] **Step 3: Re-run adapter tests**

Run:

```bash
npm test -- src/features/ai/openaiAdapter.test.ts
```

### Task 4: Reformat The Popup Output

**Files:**
- Modify: `src/features/reader/GrammarExplainPopup.tsx`
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/reader.css`
- Modify: `src/features/reader/GrammarExplainPopup.test.tsx`
- Modify: `src/features/reader/ReaderPage.test.tsx`

- [ ] **Step 1: Support the prompt’s Markdown subset**

Render:

- `##` / `###` headings
- `*` / `-` unordered lists
- ordered lists
- inline backticks

- [ ] **Step 2: Show the source sentence**

Add a dedicated `原句` card above the explanation body.

- [ ] **Step 3: Improve readability**

Use a dedicated popup layout with:

- stronger section spacing
- readable list cards
- distinct inline code chips
- scrollable body

- [ ] **Step 4: Re-run popup tests**

Run:

```bash
npm test -- src/features/reader/GrammarExplainPopup.test.tsx src/features/reader/ReaderPage.test.tsx
```

### Task 5: Verify, Smoke Test, And Publish

**Files:**
- Verify: `src/features/ai/grammarExplainPrompt.ts`
- Verify: `src/features/ai/openaiAdapter.ts`
- Verify: `src/features/reader/GrammarExplainPopup.tsx`
- Verify: `src/features/reader/reader.css`

- [ ] **Step 1: Run focused regression coverage**

Run:

```bash
npm test -- src/features/ai/grammarExplainPrompt.test.ts src/features/ai/openaiAdapter.test.ts src/features/ai/geminiAdapter.test.ts src/features/ai/aiService.test.ts src/features/reader/GrammarExplainPopup.test.tsx src/features/reader/ReaderPage.test.tsx src/features/reader/selectionActions.test.tsx
```

- [ ] **Step 2: Run a live grammar-endpoint smoke test**

Use the configured grammar endpoint and verify that the supplied sentence returns:

- `finish_reason: "stop"`
- `reasoning_content: null` or equivalent absence
- a complete `<answer>...</answer>` payload in `message.content`

- [ ] **Step 3: Build the frontend**

Run:

```bash
npm run build
```

- [ ] **Step 4: Publish the frontend**

Run:

```bash
rsync -a --delete dist/ /app/epubReader/
```

- [ ] **Step 5: Commit**

Commit the grammar explain prompt polish, popup formatting, and documentation updates together.
