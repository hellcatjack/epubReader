# Unified Local Translation Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all `HY-MT1.5`-specific translation branches and restore one shared local translation path for every local model.

**Architecture:** Keep translation mode classification unchanged, but delete model-aware branching from `selectionTranslation.ts` and `openaiAdapter.ts`. The result is that prompt building, completion routing, sampling, and cleanup all use the existing default path regardless of local model id.

**Tech Stack:** TypeScript, Vitest, Vite

---

### Task 1: Lock The Unified Behavior With Tests

**Files:**
- Modify: `src/features/ai/selectionTranslation.test.ts`
- Modify: `src/features/ai/openaiAdapter.test.ts`

- [ ] **Step 1: Write the failing prompt-builder assertions**

```ts
it("uses the default contextual word prompt even for HY-MT1.5 model ids", () => {
  const prompt = buildSelectionTranslationPrompt({
    sentenceContext: "Where else would you stick the oldest foster kid?",
    targetLanguage: "zh-CN",
    text: "stick",
    textModel: "tencent/HY-MT1.5-7B-GGUF:Q4_K_M",
  });

  expect(prompt.mode).toBe("word");
  expect(prompt.prompt).toContain("把原句里的“选中词”替换成最合适的中文片段");
  expect(prompt.prompt).toContain("选中词：stick");
});
```

- [ ] **Step 2: Write the failing adapter assertions**

```ts
it("routes HY-MT1.5 translation requests through the shared completions path", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ text: "安置" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

  const adapter = createOpenAIAdapter({
    fetch: fakeFetch,
    textModel: "tencent/HY-MT1.5-7B-GGUF:Q4_K_M",
  });

  await adapter.translateSelection("stick", {
    sentenceContext: "Where else would you stick the oldest foster kid?",
    targetLanguage: "zh-CN",
  });

  expect(fakeFetch).toHaveBeenNthCalledWith(1, "http://localhost:8001/v1/completions", expect.anything());
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/features/ai/selectionTranslation.test.ts src/features/ai/openaiAdapter.test.ts`
Expected: FAIL because current code still contains `HY-MT1.5` prompt and adapter branches.

- [ ] **Step 4: Commit**

```bash
git add src/features/ai/selectionTranslation.test.ts src/features/ai/openaiAdapter.test.ts
git commit -m "test: lock unified local translation behavior"
```

### Task 2: Remove The Model-Specific Prompt Branch

**Files:**
- Modify: `src/features/ai/selectionTranslation.ts`
- Test: `src/features/ai/selectionTranslation.test.ts`

- [ ] **Step 1: Delete the profile helpers and branch**

```ts
export function buildSelectionTranslationPrompt({
  sentenceContext,
  strict = false,
  targetLanguage,
  text,
}: BuildSelectionTranslationPromptOptions): SelectionTranslationPrompt {
  const mode = classifySelectionTranslationMode(text, sentenceContext);

  if (mode === "word" && sentenceContext) {
    return {
      mode,
      prompt: buildWordGlossPrompt(text, sentenceContext, targetLanguage, strict),
    };
  }

  return {
    mode: "sentence",
    prompt: buildSentencePrompt(text, targetLanguage),
  };
}
```

- [ ] **Step 2: Run the prompt-builder tests**

Run: `npm test -- src/features/ai/selectionTranslation.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/features/ai/selectionTranslation.ts src/features/ai/selectionTranslation.test.ts
git commit -m "refactor: unify local translation prompts"
```

### Task 3: Remove The Model-Specific Adapter Branch

**Files:**
- Modify: `src/features/ai/openaiAdapter.ts`
- Test: `src/features/ai/openaiAdapter.test.ts`

- [ ] **Step 1: Delete Hunyuan-only helpers**

```ts
function getCompletionSamplingOptions(mode: SelectionTranslationMode) {
  return {
    temperature: mode === "sentence" ? 0.2 : 0.1,
  };
}
```

- [ ] **Step 2: Remove the chat-completions translation path**

```ts
async function requestSelectionTranslation(
  fetchFn: FetchLike,
  completionEndpoint: string,
  textModel: string,
  text: string,
  context: RequestContext,
) {
  const firstPass = buildSelectionTranslationPrompt({
    sentenceContext: context.sentenceContext,
    targetLanguage: context.targetLanguage,
    text,
    textModel,
  });

  const initialOutput = await requestCompletionText(
    fetchFn,
    completionEndpoint,
    textModel,
    firstPass.prompt,
    firstPass.mode,
    context.signal,
  );

  return cleanupSelectionTranslationOutput(initialOutput, firstPass.mode);
}
```

- [ ] **Step 3: Run the adapter tests**

Run: `npm test -- src/features/ai/openaiAdapter.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/features/ai/openaiAdapter.ts src/features/ai/openaiAdapter.test.ts
git commit -m "refactor: unify local translation adapter flow"
```

### Task 4: Verify And Publish

**Files:**
- Verify: `src/features/ai/selectionTranslation.ts`
- Verify: `src/features/ai/openaiAdapter.ts`

- [ ] **Step 1: Run focused verification**

Run: `npm test -- src/features/ai/selectionTranslation.test.ts src/features/ai/openaiAdapter.test.ts`
Expected: PASS

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: PASS with a generated `dist/` directory

- [ ] **Step 3: Publish the frontend**

Run: `rsync -a --delete dist/ /app/epubReader/`
Expected: PASS with `/app/epubReader/` matching the new build output

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-06-unified-local-translation-chain-design.md \
  docs/superpowers/plans/2026-04-06-unified-local-translation-chain.md \
  src/features/ai/selectionTranslation.ts \
  src/features/ai/selectionTranslation.test.ts \
  src/features/ai/openaiAdapter.ts \
  src/features/ai/openaiAdapter.test.ts
git commit -m "refactor: restore unified local translation flow"
```
