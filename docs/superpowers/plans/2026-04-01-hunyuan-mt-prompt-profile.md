# Hunyuan MT Prompt Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a translation-only local-model profile for `HY-MT1.5-7B-GGUF` so local translation prompts and sampling parameters better match the model card without changing other local models or Gemini.

**Architecture:** Keep the existing `word / phrase / sentence` translation classification, but thread a small model-specific prompt profile through `selectionTranslation.ts` and `openaiAdapter.ts`. The default path remains unchanged; only the exact local model name `HY-MT1.5-7B-GGUF` switches to the Hunyuan profile and its completion parameters.

**Tech Stack:** TypeScript, Vitest, local OpenAI-compatible completions API, Vite, static SPA deploy via `rsync`

---

## File Map

- `src/features/ai/selectionTranslation.ts`
  - Add a model-aware prompt profile concept.
  - Generate Hunyuan-specific word/phrase/sentence prompts when `textModel === "HY-MT1.5-7B-GGUF"`.
- `src/features/ai/openaiAdapter.ts`
  - Pass model/profile information into prompt generation.
  - Apply Hunyuan-specific completion parameters for translation requests only.
- `src/features/ai/selectionTranslation.test.ts`
  - Verify prompt selection by model and translation mode.
- `src/features/ai/openaiAdapter.test.ts`
  - Verify request payload parameters and prompt content for Hunyuan vs default models.

### Task 1: Lock The Hunyuan Prompt Behavior With Tests

**Files:**
- Modify: `src/features/ai/selectionTranslation.test.ts`
- Modify: `src/features/ai/openaiAdapter.test.ts`

- [ ] **Step 1: Add failing prompt-profile tests in `selectionTranslation.test.ts`**

Add tests that prove `HY-MT1.5-7B-GGUF` gets different prompts while other models do not.

```ts
import { buildSelectionTranslationPrompt } from "./selectionTranslation";

it("uses the Hunyuan contextual word prompt for HY-MT1.5-7B-GGUF", () => {
  const result = buildSelectionTranslationPrompt({
    sentenceContext: "Where else would you stick the oldest foster kid?",
    targetLanguage: "zh-CN",
    text: "stick",
    textModel: "HY-MT1.5-7B-GGUF",
  });

  expect(result.mode).toBe("word");
  expect(result.prompt).toContain("把下面的词语按当前句子语境翻译成简体中文，不要额外解释。");
  expect(result.prompt).toContain("词语：stick");
  expect(result.prompt).toContain("句子：Where else would you stick the oldest foster kid?");
  expect(result.prompt).not.toContain("你是电子书阅读助手");
});

it("uses direct segment translation for multi-word Hunyuan selections", () => {
  const result = buildSelectionTranslationPrompt({
    sentenceContext: "He looked up at him before leaving the room.",
    targetLanguage: "zh-CN",
    text: "looked up at him",
    textModel: "HY-MT1.5-7B-GGUF",
  });

  expect(result.mode).toBe("sentence");
  expect(result.prompt).toContain("把下面的文本翻译成简体中文，不要额外解释。");
  expect(result.prompt).toContain("looked up at him");
  expect(result.prompt).not.toContain("句子：");
});

it("keeps the existing default prompt for non-Hunyuan models", () => {
  const result = buildSelectionTranslationPrompt({
    sentenceContext: "Where else would you stick the oldest foster kid?",
    targetLanguage: "zh-CN",
    text: "stick",
    textModel: "local-reader-chat",
  });

  expect(result.prompt).toContain("把原句里的“选中词”替换成最合适的中文片段");
});
```

- [ ] **Step 2: Add failing adapter payload tests in `openaiAdapter.test.ts`**

Add tests that prove translation payloads change only for the Hunyuan model.

```ts
it("uses Hunyuan sampling parameters for HY-MT1.5-7B-GGUF translation requests", async () => {
  const fakeFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(new Response(JSON.stringify({ choices: [{ text: "安置" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

  const adapter = createOpenAIAdapter({
    fetch: fakeFetch,
    textModel: "HY-MT1.5-7B-GGUF",
  });

  await adapter.translateSelection("stick", {
    sentenceContext: "Where else would you stick the oldest foster kid?",
    targetLanguage: "zh-CN",
  });

  const requestBody = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(requestBody.temperature).toBe(0.7);
  expect(requestBody.top_p).toBe(0.6);
  expect(requestBody.top_k).toBe(20);
  expect(requestBody.repetition_penalty).toBe(1.05);
});

it("keeps the default translation parameters for non-Hunyuan local models", async () => {
  const fakeFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(new Response(JSON.stringify({ choices: [{ text: "安置" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

  const adapter = createOpenAIAdapter({
    fetch: fakeFetch,
    textModel: "local-reader-chat",
  });

  await adapter.translateSelection("stick", {
    sentenceContext: "Where else would you stick the oldest foster kid?",
    targetLanguage: "zh-CN",
  });

  const requestBody = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(requestBody.temperature).toBe(0.1);
  expect(requestBody.top_p).toBeUndefined();
  expect(requestBody.top_k).toBeUndefined();
  expect(requestBody.repetition_penalty).toBeUndefined();
});
```

- [ ] **Step 3: Run the focused tests and confirm RED**

Run:

```bash
npm test -- src/features/ai/selectionTranslation.test.ts src/features/ai/openaiAdapter.test.ts
```

Expected:

```text
FAIL  src/features/ai/selectionTranslation.test.ts
FAIL  src/features/ai/openaiAdapter.test.ts
```

### Task 2: Implement The Hunyuan Prompt Profile

**Files:**
- Modify: `src/features/ai/selectionTranslation.ts`
- Modify: `src/features/ai/openaiAdapter.ts`

- [ ] **Step 1: Add model-aware prompt profile helpers in `selectionTranslation.ts`**

Introduce exact-match detection and branch prompt generation by profile.

```ts
type TranslationPromptProfile = "default" | "hunyuan_mt";

type BuildSelectionTranslationPromptOptions = {
  sentenceContext?: string;
  strict?: boolean;
  targetLanguage: string;
  text: string;
  textModel?: string;
};

function resolveTranslationPromptProfile(textModel?: string): TranslationPromptProfile {
  return textModel === "HY-MT1.5-7B-GGUF" ? "hunyuan_mt" : "default";
}
```

- [ ] **Step 2: Add Hunyuan prompt builders in `selectionTranslation.ts`**

Add minimal prompt templates that follow the model card guidance.

```ts
function buildHunyuanWordPrompt(text: string, sentenceContext: string, targetLanguage: string) {
  if (targetLanguage === "zh-CN") {
    return [
      "把下面的词语按当前句子语境翻译成简体中文，不要额外解释。",
      "",
      `词语：${text}`,
      `句子：${sentenceContext}`,
    ].join("\n");
  }

  return [
    `Translate the following word into ${describeLanguage(targetLanguage)} based on the sentence context, without additional explanation.`,
    "",
    `Word: ${text}`,
    `Sentence: ${sentenceContext}`,
  ].join("\n");
}

function buildHunyuanDirectTranslationPrompt(text: string, targetLanguage: string) {
  if (targetLanguage === "zh-CN") {
    return [
      "把下面的文本翻译成简体中文，不要额外解释。",
      "",
      text,
    ].join("\n");
  }

  return [
    `Translate the following segment into ${describeLanguage(targetLanguage)}, without additional explanation.`,
    "",
    text,
  ].join("\n");
}
```

- [ ] **Step 3: Route `buildSelectionTranslationPrompt(...)` through the profile**

Update the main prompt builder so Hunyuan uses its own templates while all other models keep the current behavior.

```ts
export function buildSelectionTranslationPrompt({
  sentenceContext,
  strict = false,
  targetLanguage,
  text,
  textModel,
}: BuildSelectionTranslationPromptOptions): SelectionTranslationPrompt {
  const mode = classifySelectionTranslationMode(text, sentenceContext);
  const profile = resolveTranslationPromptProfile(textModel);

  if (profile === "hunyuan_mt") {
    if (mode === "word" && sentenceContext) {
      return {
        mode,
        prompt: buildHunyuanWordPrompt(text, sentenceContext, targetLanguage),
      };
    }

    return {
      mode: "sentence",
      prompt: buildHunyuanDirectTranslationPrompt(text, targetLanguage),
    };
  }

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

- [ ] **Step 4: Add Hunyuan completion parameter helpers in `openaiAdapter.ts`**

Keep the existing defaults, then override only for Hunyuan translation requests.

```ts
function isHunyuanMtModel(textModel: string) {
  return textModel === "HY-MT1.5-7B-GGUF";
}

function getCompletionSamplingOptions(textModel: string, mode: SelectionTranslationMode) {
  if (isHunyuanMtModel(textModel)) {
    return {
      repetition_penalty: 1.05,
      temperature: 0.7,
      top_k: 20,
      top_p: 0.6,
    };
  }

  return {
    temperature: mode === "sentence" ? 0.2 : 0.1,
  };
}
```

- [ ] **Step 5: Thread `textModel` into prompt generation and request payload**

Update both the prompt build call and the completion request body.

```ts
const firstPass = buildSelectionTranslationPrompt({
  sentenceContext: context.sentenceContext,
  targetLanguage: context.targetLanguage,
  text,
  textModel,
});

body: JSON.stringify({
  max_tokens: getCompletionMaxTokens(mode),
  model: textModel,
  prompt,
  ...(getCompletionStop(mode) ? { stop: getCompletionStop(mode) } : {}),
  ...getCompletionSamplingOptions(textModel, mode),
}),
```

- [ ] **Step 6: Run the focused tests and confirm GREEN**

Run:

```bash
npm test -- src/features/ai/selectionTranslation.test.ts src/features/ai/openaiAdapter.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 7: Commit the implementation**

Run:

```bash
git add src/features/ai/selectionTranslation.ts src/features/ai/openaiAdapter.ts src/features/ai/selectionTranslation.test.ts src/features/ai/openaiAdapter.test.ts
git commit -m "feat: tune local prompts for hunyuan mt"
```

### Task 3: Verify The Integrated Translation Flow

**Files:**
- Modify: no additional files unless a verification-driven fix is required

- [ ] **Step 1: Run the full unit test suite**

Run:

```bash
npm test
```

Expected:

```text
Test Files  all passed
```

- [ ] **Step 2: Run an optional local smoke test against the real endpoint**

If the local OpenAI-compatible endpoint is available and `HY-MT1.5-7B-GGUF` is installed, run a quick script or existing adapter call path that submits:

```text
stick
pressed
looked up at him
She’d lie on her stomach
```

Expected:

```text
- single-word cases stay concise and contextual
- multi-word cases return direct translations
- prompts do not contain the old assistant-role wording
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
?? AGENTS.md
```
