# Hunyuan MT Prompt Profile Design

Date: 2026-04-01

## Goal

Improve local translation quality when the selected local model is `HY-MT1.5-7B-GGUF` by aligning prompts and completion sampling parameters with the model card guidance, without changing behavior for other local models or Gemini.

## In Scope

- Add a model-specific translation prompt profile for `HY-MT1.5-7B-GGUF`.
- Keep the existing translation task classification:
  - `word`
  - `phrase`
  - `sentence`
- Use minimal prompts modeled after the Hunyuan model card for this model only.
- Keep single-word contextual disambiguation, but simplify the prompt shape.
- Apply Hunyuan-specific completion parameters when this model is selected.
- Add tests that prove the new profile is isolated to this model name.

## Out Of Scope

- Rewriting the Gemini translation path.
- Changing explanation prompts.
- Switching local translation from `/v1/completions` to `/v1/chat/completions`.
- Changing behavior for any local model other than `HY-MT1.5-7B-GGUF`.
- Introducing a server-side translation proxy.

## External Guidance

The Hunyuan model card recommends:

- No default `system_prompt`
- Very short translation-only prompts
- Recommended generation parameters:
  - `top_k: 20`
  - `top_p: 0.6`
  - `repetition_penalty: 1.05`
  - `temperature: 0.7`

Reference:

- https://huggingface.co/Mungert/Hunyuan-MT-7B-GGUF

## Design

### 1. Prompt Profiles

Introduce a small translation prompt profile layer for local OpenAI-compatible models.

- Default profile:
  - Preserve the current prompt behavior for all existing local models.
- `HY-MT1.5-7B-GGUF` profile:
  - Use shorter, translation-only prompts.
  - Avoid assistant-role framing and long rule lists.
  - Do not add few-shot examples in the first implementation.

This profile affects only translation. Explanation remains unchanged.

### 2. Prompt Strategy By Translation Mode

#### Word

Keep sentence context only for single-word disambiguation.

Chinese target:

`把下面的词语按当前句子语境翻译成简体中文，不要额外解释。`

`词语：<text>`

`句子：<sentenceContext>`

Non-Chinese target:

`Translate the following word into <target_language> based on the sentence context, without additional explanation.`

`Word: <text>`

`Sentence: <sentenceContext>`

The model should return only the translated word or short replacement fragment.

#### Phrase

Keep the current product rule: multi-word selections do not use sentence context.

Chinese target:

`把下面的文本翻译成简体中文，不要额外解释。`

`<text>`

Non-Chinese target:

`Translate the following segment into <target_language>, without additional explanation.`

`<text>`

#### Sentence

Use the same minimal template as `phrase`, since whole-sentence translation is already direct translation.

This keeps Hunyuan close to its model-card usage pattern.

### 3. Completion Parameters

For `HY-MT1.5-7B-GGUF`, local translation requests use:

- `temperature: 0.7`
- `top_p: 0.6`
- `top_k: 20`
- `repetition_penalty: 1.05`

Retain current task-size caps:

- `word` keeps the existing low `max_tokens`
- `phrase` keeps the existing medium `max_tokens`
- `sentence` keeps the existing sentence `max_tokens`

Retain current stop behavior for safety:

- `word` keeps the current stop tokens
- `phrase` and `sentence` keep the current behavior unchanged

This preserves the product’s bounded output behavior while still aligning sampling with the Hunyuan guidance.

### 4. Integration Point

Keep the integration small and local:

- `selectionTranslation.ts`
  - add model-aware profile selection for translation prompt generation
- `openaiAdapter.ts`
  - select completion sampling parameters from the same profile

The adapter remains the place that knows how to talk to the provider.
The prompt builder remains the place that knows how to formulate translation requests.

### 5. Matching Rule

The special profile activates only when the local model name exactly matches:

- `HY-MT1.5-7B-GGUF`

No fuzzy matching is required for this change.
That avoids accidentally affecting neighboring Hunyuan variants.

## Testing

### Unit Tests

- `selectionTranslation.test.ts`
  - Hunyuan word prompt uses the simplified contextual template
  - Hunyuan phrase prompt uses the direct translation template with no sentence context
  - Hunyuan sentence prompt uses the direct translation template
  - non-Hunyuan models preserve current prompts

- `openaiAdapter.test.ts`
  - Hunyuan translation requests include the recommended sampling parameters
  - non-Hunyuan translation requests preserve current parameters

### Smoke Tests

If the local endpoint is available, run targeted translation checks with `HY-MT1.5-7B-GGUF` using existing real-world examples:

- `stick`
- `pressed`
- `looked up at him`
- `She’d lie on her stomach`

The goal is to confirm:

- Hunyuan profile prompts are actually being used
- outputs remain concise
- single-word disambiguation still works

## Success Criteria

- Selecting `HY-MT1.5-7B-GGUF` changes only local translation prompt/parameter behavior.
- Single-word translation still uses sentence context.
- Multi-word and sentence translation remain direct translation of the selected text.
- Other local models and Gemini behavior do not change.
- Tests, build, and redeploy succeed.
