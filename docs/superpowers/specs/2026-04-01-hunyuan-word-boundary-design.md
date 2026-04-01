# Hunyuan Word Boundary Design

Date: 2026-04-01

## Goal

Fix single-word translation overreach for the local Hunyuan MT profile, so selections like `earns` in `If he earns rank, he'll lead.` return only the meaning of the selected word instead of absorbing adjacent words such as `rank`.

## In Scope

- Tighten `word`-mode translation prompts for the local Hunyuan profile.
- Keep the current `phrase` and `sentence` Hunyuan prompt behavior unchanged.
- Add targeted word-boundary regression tests for `earns/rank`.
- Preserve the current single-word contextual disambiguation path.

## Out Of Scope

- Rewriting `phrase` or `sentence` translation behavior.
- Changing Gemini behavior.
- Adding server-side translation logic.
- Post-processing hacks that try to trim already-wrong Chinese output heuristically.

## Root Cause

The current `word` prompt still frames the task as a sentence-aware replacement fragment. That works for many verbs, but for `HY-MT1.5-7B-GGUF` it can also encourage the model to absorb the nearby object when it tries to produce a natural phrase. In the sentence `If he earns rank, he'll lead.`, this causes `earns` to expand into `获得晋升`, which incorrectly includes the sense contribution of `rank`.

This is a prompt-boundary problem, not a cleanup problem. Once the model has decided to include the adjacent noun, trimming the Chinese output afterward is unreliable.

## Design

### 1. Narrow The Word Task Definition

Keep sentence context for single-word disambiguation, but rewrite the Hunyuan `word` prompt so it explicitly says:

- translate only the selected word itself
- the sentence is for sense disambiguation only
- do not translate neighboring nouns, objects, or complements
- return the shortest core meaning

This preserves the useful context while removing the model’s excuse to produce a fuller phrase.

### 2. Add Boundary Few-Shot Examples

Add a small set of focused word-boundary examples to the Hunyuan `word` prompt, including:

- `earns` in `If he earns rank, he'll lead.` -> `获得`
- `rank` in `If he earns rank, he'll lead.` -> `军衔`

These examples teach the specific distinction that the current prompt fails to enforce.

### 3. Keep One Strict Retry For Word Mode

Retain the existing strict retry path for `word` mode, but make the stricter Hunyuan retry say that the previous answer included meaning from outside the selected word and the retry must return only the shortest core gloss.

This is a bounded second-pass safeguard, not a general multi-step repair loop.

## Testing

### Unit Tests

- `selectionTranslation.test.ts`
  - Hunyuan `word` prompt includes the stronger boundary instructions
  - Hunyuan `word` prompt includes the `earns` and `rank` examples

- `openaiAdapter.test.ts`
  - when a Hunyuan single-word response spills beyond the selected word, the stricter retry prompt is used

### Real Smoke Test

If the local Hunyuan endpoint is available, run at least:

- `earns` in `If he earns rank, he'll lead.`
- `rank` in `If he earns rank, he'll lead.`

Expected direction:

- `earns` should converge to `获得` or another equivalent single-word gloss
- `rank` should converge to `军衔`

## Success Criteria

- Single-word Hunyuan translation no longer absorbs adjacent nouns in the `earns/rank` case.
- Existing multi-word and sentence Hunyuan behavior remains unchanged.
- Tests, build, and redeploy succeed.
