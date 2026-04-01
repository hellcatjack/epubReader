# Hunyuan Word Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten Hunyuan single-word translation prompts so `earns` in `If he earns rank, he'll lead.` returns only the meaning of `earns`, while leaving Hunyuan multi-word and sentence translation behavior unchanged.

**Architecture:** Keep the current Hunyuan mixed profile: single-word requests stay on the contextual word-disambiguation path, while multi-word and sentence requests keep the Hunyuan direct-translation prompt. Narrow only the Hunyuan `word` prompt with stronger boundary instructions, add focused `earns/rank` examples, and keep the existing one-time strict retry for out-of-bound answers.

**Tech Stack:** TypeScript, Vitest, local OpenAI-compatible completions API, Vite, static SPA deploy via `rsync`

---

## File Map

- `src/features/ai/selectionTranslation.ts`
  - Tighten the Hunyuan `word` prompt wording.
  - Add Hunyuan-specific boundary examples.
  - Add a stricter Hunyuan retry wording for over-broad single-word answers.
- `src/features/ai/selectionTranslation.test.ts`
  - Lock the stronger prompt wording and `earns/rank` examples.
- `src/features/ai/openaiAdapter.test.ts`
  - Lock the stricter Hunyuan retry path for single-word spill cases.

### Task 1: Lock The Word-Boundary Regression With Tests

**Files:**
- Modify: `src/features/ai/selectionTranslation.test.ts`
- Modify: `src/features/ai/openaiAdapter.test.ts`

- [ ] **Step 1: Add failing Hunyuan word-boundary prompt tests**

Extend `src/features/ai/selectionTranslation.test.ts` with tests that prove the Hunyuan `word` prompt now forbids absorbing adjacent words.

```ts
it("adds stronger word-boundary instructions to the Hunyuan single-word prompt", () => {
  const prompt = buildSelectionTranslationPrompt({
    sentenceContext: "If he earns rank, he'll lead.",
    targetLanguage: "zh-CN",
    text: "earns",
    textModel: "HY-MT1.5-7B-GGUF",
  });

  expect(prompt.mode).toBe("word");
  expect(prompt.prompt).toContain("句子只用于判断词义");
  expect(prompt.prompt).toContain("不要把相邻名词、宾语、补语翻进去");
  expect(prompt.prompt).toContain("只输出该词最短核心词义");
});

it("includes earns/rank boundary examples in the Hunyuan single-word prompt", () => {
  const prompt = buildSelectionTranslationPrompt({
    sentenceContext: "If he earns rank, he'll lead.",
    targetLanguage: "zh-CN",
    text: "earns",
    textModel: "HY-MT1.5-7B-GGUF",
  });

  expect(prompt.prompt).toContain("选中词：earns");
  expect(prompt.prompt).toContain("所在句子：If he earns rank, he'll lead.");
  expect(prompt.prompt).toContain("答案：获得");
  expect(prompt.prompt).toContain("选中词：rank");
  expect(prompt.prompt).toContain("答案：军衔");
});
```

- [ ] **Step 2: Add a failing strict-retry test for Hunyuan word spill cases**

Extend `src/features/ai/openaiAdapter.test.ts` so a Hunyuan single-word response that spills beyond the selected word triggers the stricter retry prompt.

```ts
it("uses the stricter Hunyuan word retry prompt when a single-word answer absorbs adjacent meaning", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ text: "获得晋升" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ text: "获得" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

  const adapter = createOpenAIAdapter({
    fetch: fakeFetch,
    textModel: "HY-MT1.5-7B-GGUF",
  });

  await expect(
    adapter.translateSelection("earns", {
      sentenceContext: "If he earns rank, he'll lead.",
      targetLanguage: "zh-CN",
    }),
  ).resolves.toBe("获得");

  const retryBody = JSON.parse(String(fakeFetch.mock.calls[1]?.[1]?.body));
  expect(retryBody.prompt).toContain("上一次答案包含了选区外含义");
  expect(retryBody.prompt).toContain("只输出该词最短核心词义");
});
```

- [ ] **Step 3: Run focused tests to confirm RED**

Run:

```bash
npm test -- src/features/ai/selectionTranslation.test.ts src/features/ai/openaiAdapter.test.ts
```

Expected:

```text
FAIL  src/features/ai/selectionTranslation.test.ts
FAIL  src/features/ai/openaiAdapter.test.ts
```

### Task 2: Implement The Narrower Hunyuan Word Prompt

**Files:**
- Modify: `src/features/ai/selectionTranslation.ts`

- [ ] **Step 1: Add a dedicated Hunyuan word prompt builder**

Replace the current Hunyuan word builder passthrough with a dedicated prompt that narrows the task definition.

```ts
function buildHunyuanWordPrompt(text: string, sentenceContext: string, targetLanguage: string, strict = false) {
  if (targetLanguage === "zh-CN") {
    return [
      "请按当前句子语境翻译选中词，不要额外解释。",
      "要求：",
      "- 句子只用于判断词义",
      "- 只翻译选中词本身",
      "- 不要把相邻名词、宾语、补语翻进去",
      strict ? "- 上一次答案包含了选区外含义，这次只输出该词最短核心词义" : "- 只输出该词最短核心词义",
      "",
      "示例：",
      "选中词：earns",
      "所在句子：If he earns rank, he'll lead.",
      "答案：获得",
      "",
      "选中词：rank",
      "所在句子：If he earns rank, he'll lead.",
      "答案：军衔",
      "",
      `选中词：${text}`,
      `所在句子：${sentenceContext}`,
      "答案：",
    ].join(\"\\n\");
  }

  return [
    `Translate the selected word based on the sentence context, without extra explanation.`,
    "Rules:",
    "- The sentence is only for word-sense disambiguation",
    "- Translate only the selected word itself",
    "- Do not include adjacent nouns, objects, or complements",
    strict ? "- The previous answer included outside meaning. Return only the shortest core gloss for the selected word" : "- Return only the shortest core gloss",
    "",
    `Selected word: ${text}`,
    `Sentence: ${sentenceContext}`,
    "Answer:",
  ].join(\"\\n\");
}
```

- [ ] **Step 2: Pass the strict flag into the Hunyuan word branch**

Update the Hunyuan profile branch in `buildSelectionTranslationPrompt(...)` so word-mode retry prompts can become stricter.

```ts
if (profile === "hunyuan_mt") {
  if (mode === "word" && sentenceContext) {
    return {
      mode,
      prompt: buildHunyuanWordPrompt(text, sentenceContext, targetLanguage, strict),
    };
  }
```

- [ ] **Step 3: Run focused tests to confirm GREEN**

Run:

```bash
npm test -- src/features/ai/selectionTranslation.test.ts src/features/ai/openaiAdapter.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 4: Commit the implementation**

Run:

```bash
git add src/features/ai/selectionTranslation.ts src/features/ai/selectionTranslation.test.ts src/features/ai/openaiAdapter.test.ts
git commit -m "fix: tighten hunyuan word boundaries"
```

### Task 3: Verify Against The Real Hunyuan Endpoint

**Files:**
- Modify: no additional files unless verification reveals a genuine bug

- [ ] **Step 1: Run the full unit test suite**

Run:

```bash
npm test
```

Expected:

```text
Test Files  all passed
```

- [ ] **Step 2: Run a real local smoke test with the current endpoint**

If the local endpoint is available, run `HY-MT1.5-7B-GGUF` with:

```text
earns -> If he earns rank, he'll lead.
rank -> If he earns rank, he'll lead.
```

Expected direction:

```text
earns -> 获得
rank -> 军衔
```

- [ ] **Step 3: Build the production bundle**

Run:

```bash
npm run build
```

Expected:

```text
✓ built in ...
```

- [ ] **Step 4: Publish the updated static app**

Run:

```bash
rsync -a --delete dist/ /app/epubReader/
```

Expected:

```text
[no output]
```

- [ ] **Step 5: Inspect working tree state**

Run:

```bash
git status --short
```

Expected:

```text
M src/features/ai/openaiAdapter.test.ts
M src/features/ai/openaiAdapter.ts
M src/features/ai/selectionTranslation.test.ts
M src/features/ai/selectionTranslation.ts
?? AGENTS.md
```
