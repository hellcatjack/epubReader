# Grammar Explain Popup Design

Date: 2026-04-06
Base commit: `89a135b`

## Goal

Reposition `Explain` from a slow, sidebar-bound explanation panel into a dedicated grammar-analysis workflow:

- `Explain` remains available from the existing top bar and selection actions.
- Results are shown in an independent popup instead of the right sidebar.
- The popup is asynchronous: it opens immediately with a loading state, then updates when the grammar analysis returns.
- The popup is closed only via an explicit `X` control.
- The right sidebar no longer shows an `Explanation` section.
- Grammar analysis uses its own LLM API URL and model settings, separate from translation.

The feature is intended specifically for Chinese-speaking learners who want a Chinese explanation of the grammar structure of selected English text.

## Non-goals

- Do not change how `Translate` works.
- Do not remove or rename the existing `Explain` buttons.
- Do not make the popup draggable or resizable in this iteration.
- Do not add a second provider matrix for grammar analysis beyond a local OpenAI-compatible endpoint and model string.

## Current Problems

1. `Explain` is mixed into the right `Reading assistant` panel, which competes with translation and IPA for space.
2. The current explanation path returns a bilingual explanation rather than a focused Chinese grammar breakdown.
3. Explanation requests are slow enough that a synchronous in-panel update feels laggy and blocks the user from understanding whether anything is happening.
4. `Explain` currently shares the same provider configuration as translation, making it impossible to tune a slower but better grammar model independently.

## Recommended Approach

Keep the `Explain` trigger where users already expect it, but replace the display and configuration model:

- `Explain` opens a dedicated popup immediately.
- The popup owns its own loading, success, and error states.
- The popup displays only Chinese grammar analysis.
- Grammar analysis uses independent settings:
  - `grammarLlmApiUrl`
  - `grammarLlmModel`
- If those settings are empty, `Explain` falls back to the current translation/local provider configuration so the feature remains usable after upgrade.

## UX Design

### Trigger Behavior

Existing `Explain` triggers remain unchanged:

- Top bar `Explain`
- Selection action `Explain`

When clicked:

1. Capture the current selected text.
2. Open the grammar popup immediately.
3. Show the selected English fragment in the popup header/body context.
4. Show `正在解析语法...`.
5. Resolve the async request and replace the body with the returned Chinese grammar analysis.

### Popup Behavior

The popup is a dedicated overlay component, not a tooltip:

- Independent surface with border, shadow, and scrollable body.
- Anchored near the reading area without covering the main text column.
- Explicit close button `X` in the top-right corner.
- No auto-dismiss.
- No dismissal from:
  - clicking the document body
  - scrolling
  - turning pages
  - selecting new text
- Only `X` closes it in this iteration.

### Popup Content

The popup contains:

- Title: `Grammar`
- Optional short subline showing the selected English text
- Body states:
  - Loading: `正在解析语法...`
  - Success: Chinese grammar analysis
  - Error: short inline error such as `语法解析失败，请重试。`

The output should read like a compact grammar tutor note in Chinese, not like a translation or general summary.

### Right Sidebar Changes

`Reading assistant` keeps:

- `Selection`
- `IPA`
- `Translation`

`Explanation` is removed entirely from the sidebar.

## Data and Settings Design

### New Settings

Add two settings fields:

- `grammarLlmApiUrl: string`
- `grammarLlmModel: string`

They are persisted alongside existing settings and shown in:

- `SettingsDialog`
- `AppearancePanel` on the reader page

### Resolution Rules

`aiService.explainSelection()` resolves configuration in this order:

1. If `grammarLlmApiUrl` or `grammarLlmModel` is configured, build a dedicated local adapter for grammar analysis using those values.
2. Otherwise, fall back to the current translation adapter resolution path.

This keeps the feature backwards-compatible while still enabling independent grammar tuning.

## Prompt Design

The explanation prompt changes from bilingual explanation to Chinese grammar analysis.

Target behavior:

- Explain the grammar of the selected English segment in Chinese.
- Focus on:
  - sentence skeleton
  - clause structure
  - phrase roles
  - difficult grammar points
- Return Chinese only.
- Do not provide a separate English explanation.
- Do not turn into a plain translation.
- Do not explain unrelated context outside the selected text.

Example instruction shape:

`请用中文解析下面英文片段的语法结构。重点说明句子主干、从句或短语作用、关键词的语法功能。只输出中文解析，不要翻译整段，不要额外寒暄。`

## Architecture Changes

### AI Layer

- Keep `translateSelection()` unchanged.
- Change `explainSelection()` to use the grammar-specific configuration resolution path.
- Update local adapter explain prompt generation to output Chinese grammar analysis only.
- Gemini path may continue to exist as fallback only when grammar-specific configuration is empty and current provider is Gemini.

### Reader State

Introduce a dedicated popup state in `ReaderPage`:

- selected text for grammar popup
- open/closed
- loading
- result
- error

This popup state should be independent from translation bubble state and independent from TTS sentence translation note state.

### UI Components

Add a dedicated component, for example:

- `GrammarExplainPopup.tsx`

Responsibilities:

- render loading/result/error
- render close button
- handle scrollable content
- no business logic for requests

## Error Handling

- If there is no selection, `Explain` remains inert just as today.
- If the request fails:
  - keep the popup open
  - show inline error text
  - do not replace it with a toast
- If the user triggers `Explain` again with another selection while the popup is open:
  - refresh the popup content for the new selection
  - keep the same popup surface open

## Testing Strategy

### Unit / Component Tests

1. `Explain` opens popup immediately with loading state.
2. Popup updates asynchronously when result resolves.
3. Popup displays inline error when request fails.
4. Clicking `X` closes popup.
5. Right sidebar no longer renders `Explanation`.
6. Grammar-specific settings override the normal translation/local model settings for `Explain`.
7. Fallback to existing adapter still works when grammar settings are empty.

### Integration Tests

1. Top bar `Explain` opens the popup and resolves correctly.
2. Selection popover `Explain` opens the same popup.
3. Changing selection while popup is open updates the popup content.

### Browser Tests

1. Real page selection + `Explain` shows popup and async result.
2. Popup remains open across page scroll or navigation interactions until `X`.
3. Popup does not overlap the main text column in standard desktop and tablet layouts.

## Scope Boundaries

This spec covers:

- explain prompt redesign
- grammar-specific API settings
- popup UI
- sidebar removal of explanation
- tests and async behavior

This spec does not cover:

- server-side grammar analysis
- explanation history
- drag-to-reposition popup
- persistent multi-window note manager
