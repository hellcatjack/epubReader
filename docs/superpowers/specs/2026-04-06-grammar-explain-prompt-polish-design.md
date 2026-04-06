# Grammar Explain Prompt Polish Design

Date: 2026-04-06

## Goal

Refine the grammar explanation flow so it produces natural Chinese reading guidance, avoids over-constrained prompt artifacts, and renders the final result in a clean popup that is easy to scan.

## In Scope

- Redesign the grammar explanation prompts away from rigid instruction lists.
- Keep grammar explanation on the dedicated OpenAI-compatible chat endpoint.
- Stabilize responses from reasoning-capable local chat models.
- Improve grammar popup formatting so headings, lists, and inline code render correctly.
- Show the selected source sentence together with the grammar explanation.
- Update unit and integration tests for the new output contract.

## Out Of Scope

- Reworking the selection translation flow.
- Introducing a full Markdown renderer or third-party rich text dependency.
- Hardcoding post-processing rules that force specific explanation wording.
- Changing the existing grammar-specific settings model.

## Problem

The first grammar popup iteration solved the display-location problem, but it still had three quality issues:

1. The prompt was too restrictive, so the answer often read like a stiff grammar checklist rather than a useful tutor note.
2. Reasoning-enabled local chat models could spend too much budget on hidden thinking, causing `message.content` to truncate or return empty.
3. The popup renderer only handled a narrow subset of formatting, so Markdown markers such as headings, bullets, and backticks could leak into the visible UI instead of rendering as structure.

## Design

### 1. Prompt Contract: Natural Guided Reading

Replace the old “Chinese grammar analysis only” prompt shape with a more teacher-like instruction set.

System prompt responsibilities:

- frame the model as a Chinese reading teacher
- prefer natural, smooth Chinese over taxonomy-like grammar labels
- allow small English phrase references for positioning
- require the final user-facing answer to be wrapped in `<answer>...</answer>`
- require clean Markdown and forbid code blocks

User prompt responsibilities:

- ask the model to “顺一遍” the sentence rather than enumerate terminology
- organize the output into exactly three short sections:
  - `## 先看整句`
  - `## 再拆结构`
  - `## 读起来要注意`
- ask for short Markdown lists in the latter two sections
- explicitly prefer compactness over exhaustive coverage

This keeps the structure predictable without making the prose sound like a template dump.

### 2. Endpoint Behavior: Disable Thinking For The Final Answer Path

Grammar explanation continues to use the dedicated chat-completions route, but the request payload is tuned for reasoning-capable local models:

- `max_tokens: 1400`
- `temperature: 0.2`
- `chat_template_kwargs.enable_thinking: false`

The critical change is `enable_thinking: false`. On the configured grammar endpoint, this prevents the model from consuming most of the token budget on hidden reasoning and materially improves the chance of receiving a complete answer in `message.content`.

### 3. Output Extraction Contract

Keep a small extraction helper that:

- returns the text inside `<answer>...</answer>` when present
- tolerates an opening `<answer>` without a closing tag
- otherwise returns the raw trimmed output

This is a light transport cleanup layer, not a content rewriting layer.

### 4. Popup Presentation

The popup should present the explanation like a polished reading note:

- show the selected source sentence in a dedicated quote card labeled `原句`
- render section headings as real headings
- render bullet/numbered lines as structured lists
- render inline backticks as styled code chips
- keep the body scrollable and visually separate list items as readable cards

The renderer should support the prompt’s intended output without relying on full Markdown coverage.

## Testing Strategy

### Prompt and Adapter Tests

- `grammarExplainPrompt.test.ts`
  - verify the teacher-style prompt language
  - verify the three-section contract
  - verify `<answer>` extraction
- `openaiAdapter.test.ts`
  - verify grammar explain requests still use chat-completions
  - verify `chat_template_kwargs.enable_thinking` is sent
  - verify tagged answers are stripped before returning to the UI
- `geminiAdapter.test.ts`
  - verify fallback explain output follows the same tagged Markdown contract

### UI Tests

- `GrammarExplainPopup.test.tsx`
  - verify headings, lists, and inline code render correctly
  - verify the original sentence is shown in the popup
- `ReaderPage.test.tsx`
  - verify the popup opens immediately in loading state
  - verify the selected sentence remains visible while the request is pending

### Live Validation

Validate the final request shape against the configured grammar chat endpoint using the sentence:

`“What are we supposed to do, then?” asked a boy, a really small black kid who had a top bunk near Ender’s.`

Expected live characteristics:

- `finish_reason` is `stop`
- `reasoning_content` is absent or `null`
- `message.content` contains a full `<answer>...</answer>` payload

## Success Criteria

- Grammar explanations read naturally in Chinese instead of as rigid bullet dumps.
- The grammar endpoint consistently returns the user-facing answer in `message.content`.
- Popup formatting correctly renders headings, lists, and inline backticks.
- The selected sentence is visible together with the explanation.
- Tests pass, build succeeds, and the frontend is published to `/app/epubReader/`.
