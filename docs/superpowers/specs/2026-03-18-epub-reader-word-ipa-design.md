# EPUB Reader Word IPA Design

**Date:** 2026-03-18

## Summary

When the reader selects a single English word, the existing automatic translation flow should also fetch and display that word's IPA transcription in the `Translation` panel.

This is a small enhancement to the current selection flow. It should not change the translation engine, browser TTS engine, or general multi-word translation behavior.

## Product Goal

The right-side translation panel should feel more useful for language learning:

- single-word selections should show both meaning and pronunciation
- phrase and sentence selections should keep the current translation-only behavior
- IPA lookup must be lightweight, free to use, and safe to ignore when unavailable

## Source Decision

The recommended IPA source is `Free Dictionary API`:

- endpoint: `https://api.dictionaryapi.dev/api/v2/entries/en/<word>`
- no API key required
- intended for direct dictionary lookup
- response includes `phonetic` and `phonetics[].text`

This makes it a good fit for front-end-only word lookups without adding another credentialed service.

## Scope

### In Scope

- detect when the current selection is exactly one English word
- fetch IPA for that word from `dictionaryapi.dev`
- show IPA in the `Translation` panel
- cache IPA lookups in memory for the current session
- keep the current automatic translation and automatic read-aloud behavior

### Out of Scope

- phrase-level pronunciation lookup
- sentence-level phonetic transcription
- replacing the existing translation endpoint
- adding a dedicated pronunciation page
- storing IPA history in IndexedDB

## Detection Rules

IPA lookup should only run when all of the following are true:

- the selection is released
- the trimmed selection is non-empty
- it contains exactly one token after whitespace normalization
- it matches an English-word pattern such as letters plus optional apostrophe or hyphen

Examples that should trigger:

- `pressed`
- `Morgan's`
- `snow-covered`

Examples that should not trigger:

- `The thing`
- `...`
- `Chapter One`
- `was pressed`

## Data Flow

### Selection Flow

For a released single-word selection:

1. keep the existing automatic translation request
2. in parallel, request IPA from the dictionary service
3. update the `Translation` panel with:
   - selected word
   - IPA, if found
   - translated result

For non-word or multi-word selections:

1. keep the existing automatic translation request
2. clear any prior IPA display
3. do not call the dictionary service

### Caching

IPA lookups should use a small in-memory cache keyed by normalized lowercase word:

- `Pressed` and `pressed` reuse the same cached result
- cache lifetime only needs to match the current page session
- failures should not be cached as hard errors forever; a simple “missing” cache entry is acceptable

## UI Design

The IPA should appear only in the `Translation` panel, not in the reader canvas.

Recommended order inside the panel:

1. `Selection: pressed`
2. `IPA: /prest/`
3. translation body

If IPA is unavailable:

- omit the `IPA` row entirely
- do not show a warning
- keep the translated result visible

This keeps the panel compact and avoids making dictionary lookup feel like a blocking dependency.

## Architecture

The feature should be isolated into a small service layer instead of mixing fetch logic into `ReaderPage`.

Recommended split:

- `phoneticsService`
  - normalize candidate word
  - decide whether the selection is eligible
  - query `dictionaryapi.dev`
  - extract the best IPA string
  - cache results in memory
- `ReaderPage`
  - trigger IPA lookup alongside translation for eligible selections
  - keep result state synchronized with the current selection version
- `AiResultPanel`
  - render an optional IPA row when present

## Error Handling

IPA lookup failure must be non-blocking:

- if the dictionary request fails, translation still succeeds
- if no IPA is returned, translation still succeeds
- if selection changes mid-request, stale IPA results must be ignored

The UI should only surface errors for translation failures, not pronunciation lookup failures.

## Testing

The change should be covered at three levels:

### Unit

- single-word eligibility detection
- IPA extraction from representative dictionary responses
- normalization and cache behavior

### Reader Integration

- single-word selection shows IPA and translation
- multi-word selection shows translation but no IPA
- changing selection invalidates stale IPA updates

### Browser

- selecting one word in the reader shows an IPA row in the right panel
- selecting multiple words does not show an IPA row

## Risks

- dictionary API availability is external and may vary
- browser-side dictionary fetches depend on CORS remaining compatible
- IPA formatting can differ between dictionary entries, so the UI should treat it as display text, not structured phonology data

## Recommendation

Implement this as a lightweight, front-end-only enhancement:

- use `dictionaryapi.dev`
- only for single English words
- render IPA inline in the existing translation panel
- fail silently when lookup is unavailable

This gives the reader a meaningful vocabulary-learning upgrade without destabilizing the current translation and TTS flows.
