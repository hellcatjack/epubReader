# EPUB Reader Shared Translation and Explanation Design

**Date:** 2026-03-18

## Summary

This change keeps the existing local LLM-backed translation flow, but changes the reader-side AI panel so `Translation` and `Explanation` can be shown together instead of replacing each other.

The goal is to make the right-side assistant panel behave like a stable reading companion:

- the selected text stays visible
- IPA remains attached to single-word translations
- translation remains visible after the user asks for explanation
- explanation appears as an additional section rather than a mode switch

## Product Goal

The reader should support two different user rhythms without changing tools:

- quick lookup: select text and immediately see translation
- deeper understanding: click `Explain` and add contextual explanation without losing the translation

This should feel additive, not state-destructive.

## Scope

### In Scope

- display `Translation` and `Explanation` in the same right-side AI card
- keep `Selection` and `IPA` in the existing metadata cluster
- preserve current auto-translate on released selection
- preserve the existing manual `Explain` button
- show explanation beneath translation instead of replacing it

### Out of Scope

- changing the local LLM provider
- changing translation prompts
- changing IPA lookup source
- changing selection/TTS behavior
- changing the right rail layout beyond the AI panel card itself

## Current Problem

The current implementation stores:

- `aiTitle`
- `aiResult`

This means the panel can represent only one mode at a time. When `Explain` is triggered, the panel title changes to `Explanation` and the translated text disappears. That makes the panel feel unstable and forces the user to remember the original translation.

## Target Behavior

The AI panel should become a stable dictionary/assistant card with fixed sections:

1. selected text
2. IPA when available
3. translation
4. explanation

### Trigger Rules

- on released selection:
  - clear previous AI content
  - request translation
  - request IPA when the selection is a single English word
- on `Explain`:
  - preserve current translation
  - request explanation
  - fill the explanation section only

### Empty States

- before any selection:
  - show a compact helper prompt
- after translation but before explanation:
  - explanation section shows a light hint such as `Click Explain for deeper context.`
- if explanation fails:
  - translation stays visible
  - explanation section shows only its own error state

## Panel Structure

The panel should no longer behave like a mode switch. It should have a fixed structure:

- card heading
- metadata surface
- translation surface
- explanation surface

### Metadata Surface

Contains:

- `Selection`
- `IPA`

This remains compact and secondary.

### Translation Surface

The first primary content block.

- stronger visual emphasis
- intended for fast scanning

### Explanation Surface

The second content block.

- slightly quieter than translation
- optimized for multi-line context output
- still visually distinct and easy to read

## State Model

Replace the single-result UI model with independent result slots:

- `selectedText`
- `ipa`
- `translation`
- `translationError`
- `explanation`
- `explanationError`

This avoids title-based branching and allows partial success:

- translation can succeed while explanation fails
- explanation can be added after translation without resetting the panel

## Architecture

### ReaderPage

`ReaderPage.tsx` should own request timing and state updates:

- auto-translate updates `translation`
- manual explain updates `explanation`
- new selection resets both sections before starting the next translation cycle

### AiResultPanel

`AiResultPanel.tsx` should become a pure display component for:

- metadata
- translation block
- explanation block
- local section-level empty/error states

The panel should no longer infer behavior from `title === "Translation"`.

## Error Handling

Error handling should be section-scoped:

- translation failure:
  - translation section shows its error
  - explanation section stays empty/idle
- explanation failure:
  - translation remains intact
  - explanation section shows its own error

This keeps the card useful even when one request fails.

## Testing

### Component / Integration

- AI panel renders translation and explanation sections independently
- IPA remains optional
- explanation empty state appears before user clicks `Explain`
- explanation can be added without clearing translation

### Browser

- selection shows translation
- clicking `Explain` keeps translation visible and adds explanation below it
- IPA, translation, and explanation can coexist in one panel

## Recommendation

Implement this as a reader-state and panel-structure refinement:

- keep the current local LLM workflow
- split AI state into translation/explanation slots
- redesign the panel around additive information instead of a single mutable title/result pair

This directly matches how users actually read: quick lookup first, deeper context second.
