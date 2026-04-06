# Unified Local Translation Chain Design

Date: 2026-04-06

## Goal

Remove the `HY-MT1.5`-specific translation behavior and make all local translation requests use the same prompt construction and request flow.

## In Scope

- Remove `HY-MT1.5` prompt specialization from `selectionTranslation.ts`.
- Remove `HY-MT1.5`-specific translation routing from `openaiAdapter.ts`.
- Keep the existing `word`, `phrase`, and `sentence` translation classification.
- Keep grammar explanation behavior unchanged.
- Update tests so `HY-MT1.5` model ids now prove the unified local translation path.

## Out Of Scope

- Reworking Gemini translation behavior.
- Changing grammar explain prompts or endpoints.
- Redesigning the general translation prompt structure for all models.
- Editing historical feature design docs that recorded why the removed branch existed.

## Problem

The current local translation implementation carries a dedicated `HY-MT1.5` branch in two places:

- prompt building in `selectionTranslation.ts`
- transport, sampling, and retry behavior in `openaiAdapter.ts`

That branch makes `HY-MT1.5` behave differently from every other local model, which is now explicitly undesired. The product requirement is to restore a single local translation path regardless of the selected local model id.

## Design

### 1. Prompt Unification

Delete the model-profile layer from `selectionTranslation.ts`.

After this change:

- single-word selections still use the existing contextual gloss prompt
- non-word selections still use the existing direct translation prompt
- `textModel` no longer changes prompt generation

This preserves current translation-mode behavior while removing model-specific prompt drift.

### 2. Request-Path Unification

Delete the `HY-MT1.5` translation special case from `openaiAdapter.ts`.

After this change:

- all local translation requests go through `/v1/completions`
- all local translation requests use the shared completion payload shape
- all local translation requests use the existing shared temperature logic
- `HY-MT1.5` no longer uses chat-completions for translation
- `HY-MT1.5` no longer uses custom prompt wrapping
- `HY-MT1.5` no longer uses the mixed-script retry branch

Grammar explanation remains on chat-completions as it does today.

### 3. Test Strategy

Update unit tests so they prove the new invariant:

- `selectionTranslation.test.ts`
  - `HY-MT1.5` model ids produce the same prompt family as other local models
- `openaiAdapter.test.ts`
  - `HY-MT1.5` model ids send translation requests to `/v1/completions`
  - `HY-MT1.5` model ids use the shared completion parameters
  - no `HY-MT1.5`-specific chat retry behavior remains

## Success Criteria

- No translation prompt branch remains for `HY-MT1.5`.
- No translation transport branch remains for `HY-MT1.5`.
- `HY-MT1.5` translation requests behave the same as other local models.
- Translation tests pass.
- Build succeeds.
- `dist/` is synced to `/app/epubReader/`.
