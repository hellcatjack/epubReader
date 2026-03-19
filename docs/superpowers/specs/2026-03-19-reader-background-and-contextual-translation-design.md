# Reader Background and Contextual Translation Design

## Summary

This design covers two adjacent reader improvements:

1. allow users to customize the background color of the book text display area
2. fix contextual translation so single words and phrases return the selected span's meaning in the current sentence instead of drifting into whole-sentence translation

The two changes are independent in behavior but share the same reader settings and reader-side interaction surfaces, so they can be designed together while still being implemented as separate tracks.

## Goals

- users can freely change the background color of the book reading surface
- the selected-text translation path uses sentence context for disambiguation
- when a user selects a single word or a phrase, the translation result should be the meaning of that selected span itself, not a translated or paraphrased whole sentence
- the solution should be based on actual local model behavior, not assumed prompt compliance

## Non-Goals

- redesigning the entire reader theme system
- changing explanation behavior in the same pass
- changing TTS behavior
- introducing third-party translation providers

## Current State

### Reader Background

The current settings model persists typography, spacing, width, theme, and TTS fields, but it does not store a dedicated content background color. The reader theme builder controls typography and layout, while the reading surface background is effectively determined by the existing theme and outer shell styling.

### Translation

The current translation path sends selected text plus sentence context into the local AI adapter, but it still uses the chat-style endpoint and a prompt that asks the model to translate the selected text in context. On the current local model, that instruction is too weak: the model often translates or paraphrases the full sentence rather than returning the selected span's isolated meaning.

## Local Prompt Testing Findings

The repository's local endpoint currently reports this model:

- `tencent/HY-MT1.5-1.8B-GGUF:Q4_K_M`

The endpoint metadata reports `completion` capability, not chat capability. Prompt tests against the live local endpoint showed:

### Chat-Completions Results

Using the current `chat/completions` style prompt:

- `pressed` in `She looked pressed for time before the meeting.`
  - output drifted to a whole-sentence rendering
- `pressed` in `The flowers were pressed between pages.`
  - output drifted to a whole-sentence rendering
- `looked up at him` in `He looked up at him before leaving the room.`
  - output drifted to a whole-sentence rendering

Even stricter chat prompts, JSON-only prompts, and repair prompts remained unstable on this local model.

### Completions Results

Using `/v1/completions` with direct task prompts:

- `pressed` + `She looked pressed for time before the meeting.`
  - output: `时间紧迫的`
- `pressed` + `The flowers were pressed between pages.`
  - output: `压平`

For phrase cases, `/v1/completions` also improved when the prompt explicitly asked for a replaceable Chinese phrase and, for best stability, included a small few-shot example:

- `looked up at him` + `He looked up at him before leaving the room.`
  - stable best output: `抬头看着他`

### Root Cause Inference

The translation quality problem is not just prompt wording. The local model follows short completion-style tasks better than chat-style conversational instruction. The current implementation is therefore mismatched to the model's advertised and observed strengths.

This is an inference from local endpoint behavior and prompt test evidence, not a claim about all models.

## Design Overview

### Track 1: Reader Background Color

Add a dedicated persisted reader preference for the book content area's background color:

- proposed field: `contentBackgroundColor`

This field is separate from `theme`:

- `theme` continues to control the surrounding application chrome
- `contentBackgroundColor` controls the book page surface itself

The value should be available from:

- the global settings dialog
- the in-reader `Appearance` panel

Both surfaces should write to the same persisted settings store and stay synchronized.

### Track 2: Contextual Translation Routing

Translate requests should be classified before prompt construction:

- `word`
- `phrase`
- `sentence`

The routing logic should use:

- the selected text
- the sentence context already captured from the reader selection

Proposed behavior:

- `word`:
  - use `/v1/completions`
  - use a word-gloss prompt
  - return only the selected word's meaning in context
- `phrase`:
  - use `/v1/completions`
  - use a phrase-gloss prompt with a tiny few-shot scaffold
  - return only the selected phrase's meaning in context
- `sentence`:
  - use normal translation behavior for the full selected sentence

## Reader Background Design

### Data Model

Extend settings types and default settings with:

- `contentBackgroundColor: string`

Default should depend on existing theme intent:

- `light`: a neutral near-white page tone
- `sepia`: a paper-like warm tone
- `dark`: a dark page tone that still supports readability

The stored value remains a plain CSS color string.

### Presentation

The free color picker should appear in:

- `SettingsDialog` inside advanced typography controls
- `AppearancePanel` inside the reader

Suggested label:

- `Page background`

The chosen color should apply to:

- the EPUB iframe `body`
- the reader's page shell around the content
- any loading placeholder that visually stands in for the page

This avoids a mismatch where the book page changes color but the surrounding page frame stays stuck on the old theme tone.

## Contextual Translation Design

### Selection Classification

Classify the selected content into one of three kinds:

#### Word

Use when the normalized selection:

- contains no spaces
- is short
- is primarily letters, digits, apostrophes, or hyphens

Examples:

- `pressed`
- `light`
- `run-down`

#### Phrase

Use when the normalized selection:

- contains multiple words
- is meaningfully shorter than the sentence context
- is not effectively the full sentence

Examples:

- `looked up at him`
- `pressed for time`

#### Sentence

Use when the normalized selection is effectively the same as the sentence context after normalization.

This protects full-sentence selection from being incorrectly forced into gloss mode.

### Endpoint Strategy

Use `/v1/completions` for translation requests on the current local model.

Rationale:

- it matches the model's reported capability
- it performed materially better in local prompt tests
- it lets prompts be short, direct, and format-constrained

The adapter should support a text-completion request path for translation while leaving explanation behavior untouched in this design.

### Prompt Strategy

#### Word Gloss Prompt

Characteristics:

- completion prompt
- concise Chinese instruction
- asks for only the selected word's Chinese meaning in context
- forbids whole-sentence translation
- constrains output to a short Chinese gloss

Expected behavior:

- `pressed` in a time-pressure sentence -> `时间紧迫的`
- `pressed` in a flowers-between-pages sentence -> `压平`

#### Phrase Gloss Prompt

Characteristics:

- completion prompt
- asks for a replaceable Chinese phrase
- forbids whole-sentence translation and explanation
- includes one or two short few-shot examples for phrase-level behavior

Expected behavior:

- `looked up at him` -> `抬头看着他`

#### Sentence Translation Prompt

Characteristics:

- completion prompt
- ordinary full-sentence translation task
- no gloss constraint

### Output Guardrails

For `word` and `phrase` modes:

- trim output
- strip surrounding quotes
- if multiple lines are returned, use the first non-empty line

Add one light retry path only when the response clearly looks like a full sentence instead of a gloss. Signals can include:

- strong sentence-ending punctuation
- length clearly exceeding the expected gloss range

That retry should use a stricter completion prompt. Do not add multi-step repair chains.

## Error Handling

### Background Color

- invalid or empty color input should fall back to the last valid saved value
- reader should never crash because of a malformed color string

### Translation

- if `sentenceContext` is missing, translation still proceeds using the selected text
- if gloss-mode translation fails, preserve existing error display behavior
- if classification is ambiguous, prefer `phrase` over `word`

## Testing Strategy

### Prompt and Adapter Tests

- verify translation uses `/v1/completions` for the local translation path
- verify `word`, `phrase`, and `sentence` classification
- verify word-gloss prompt construction
- verify phrase-gloss prompt construction with few-shot examples
- verify full-sentence selections do not use gloss-mode prompts

### Reader Integration Tests

- word selection passes sentence context into translation
- phrase selection passes sentence context into translation
- sentence selection uses full-sentence translation mode
- existing explanation and TTS flows remain intact

### Reader Preference Tests

- `contentBackgroundColor` persists in settings
- settings dialog can edit the page background value
- in-reader appearance panel can edit the page background value
- reader theme builder includes the page background color in book surface styling

### Verification

Before claiming completion:

- run targeted unit and integration tests
- run `npm test`
- run `npm run build`
- run `rsync -a --delete dist/ /app/epubReader/`

## Acceptance Criteria

- users can choose any page background color through a free color picker
- the chosen page background persists and is reflected in both settings surfaces
- the book text display area visibly uses the chosen background color
- word selections return the selected word's meaning in the current sentence instead of a full-sentence translation
- phrase selections return the selected phrase's meaning in the current sentence instead of a full-sentence translation
- full-sentence selections still return normal sentence translations
- the design is grounded in verified local model prompt behavior rather than assumed prompt compliance
