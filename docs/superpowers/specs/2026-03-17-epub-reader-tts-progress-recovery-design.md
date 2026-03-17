# EPUB Reader TTS Progress and Recovery Design

**Date:** 2026-03-17

## Summary

Enhance the browser-based reader with four closely related reading experience upgrades:

- selected text should auto-translate and auto-read aloud in the same interaction
- continuous TTS should visibly mark playback progress inside the reading surface
- TTS speed should be configurable and easy to adjust while reading
- reading progress recovery should remain reliable even when the current reading URL is lost

The design builds on the current browser-native Edge TTS architecture and local progress persistence model. It does not reintroduce localhost TTS services.

## Product Goal

The EPUB reader must support:

- automatic translation plus automatic short-form TTS on selection
- a graceful, non-distracting in-text marker for the current continuous TTS segment
- adjustable TTS speed with both saved defaults and in-reader access
- strong progress recovery from the bookshelf, even when the reader URL is no longer available

## Scope

### In Scope

- auto-read selected text after the existing automatic translation trigger
- paragraph-level visual marking of the currently spoken continuous-reading segment
- automatic scroll-follow so the active TTS segment remains comfortably visible
- global saved TTS rate plus in-reader quick controls
- richer progress persistence with fallback recovery metadata
- a clear `Continue reading` entry point on the bookshelf

### Out of Scope

- word-level karaoke highlighting
- sentence-by-sentence visual tracking
- cloud sync
- account-based history recovery
- full-text reindexing just for progress recovery

## Architecture

### High-Level Shape

The system remains:

- browser-native EPUB reader
- browser-native TTS through `speechSynthesis`
- local persistence through `IndexedDB`

The changes extend:

- selection reaction logic
- continuous TTS queue metadata
- viewport annotation/overlay behavior
- bookshelf progress affordances

## Selection Auto-Read Behavior

The selection pipeline should become:

1. user completes a text selection
2. reader automatically requests translation
3. reader automatically starts a short `Read aloud` action for the selected text

The selection auto-read path should share the same selection de-duplication key already used for automatic translation:

- `spineItemId`
- `cfiRange`
- `text`

This prevents repeated playback while the user is still refining the same selection.

### Guardrails

Selection auto-read should not trigger when:

- selected text is empty after trim
- selected text is only punctuation
- selected text is too short to be useful, such as a single punctuation mark
- the same selection key already triggered during the current active selection cycle

Translation failure must not block automatic TTS, and TTS failure must not suppress translation results.

## Continuous TTS Progress Marking

The reader should display the current continuous-reading segment directly inside the rendered EPUB content.

The recommended visualization is:

- a soft background highlight for the active paragraph segment
- lighter and calmer than manual highlight colors
- no sentence bouncing or word-by-word flashing

This marker should feel like a reading guide, not a karaoke effect.

### Scroll Behavior

When a new segment begins:

- the reader should attempt to keep the active segment in view
- prefer scrolling so the segment sits around the upper-middle portion of the viewport
- avoid aggressive recentering if the segment is already comfortably visible

If in-surface segment positioning fails, continuous TTS should continue and the right-side status panel remains the source of truth.

## TTS Speed Controls

TTS rate should exist in two places:

- settings page as the saved default
- right-side TTS panel as an in-reader quick control

The in-reader control should use a small curated set of steps such as:

- `0.8x`
- `1.0x`
- `1.2x`
- `1.4x`

Changing the in-reader control should:

- take effect immediately for newly started speech
- persist back into local settings

This keeps the system simple: one real rate value, two entry points.

## Progress Persistence and Recovery

The existing progress record is not enough on its own because a saved `CFI` may fail to restore in some edge cases.

The persistence model should continue saving:

- `bookId`
- `cfi`
- `progress`

and add recovery metadata:

- `spineItemId`
- `textQuote`
- `updatedAt`

### Recovery Strategy

When reopening a book:

1. try the saved `cfi`
2. if that fails, open the saved `spineItemId`
3. once in that spine item, try locating near the saved `textQuote`
4. if that still fails, fall back to the chapter start

This gives the reader a real recovery ladder instead of a single fragile pointer.

## Continue Reading Entry Point

The bookshelf should make recovery visible instead of expecting users to remember or reconstruct the reader URL.

Add a `Continue reading` section that:

- shows the most recently read book first
- includes a brief progress hint, such as percentage or chapter label
- opens directly to the saved reading position

The standard book card open action should still restore last progress for that book, but the explicit `Continue reading` area becomes the primary re-entry path when the URL is gone.

## Data Flow

### Selection Auto-Translate + Auto-Read

1. selection bridge publishes a selection
2. reader derives the selection key
3. if the key is new, translation starts
4. if the key passes the TTS guardrails, selection speech also starts
5. both results update independently

### Continuous TTS

1. current reading location is converted into paragraph-first chunks
2. each chunk records:
   - `index`
   - `spineItemId`
   - `text`
   - an approximate location anchor such as `cfiRange` or starting CFI
3. the queue speaks chunks in order
4. on each chunk start, the viewport marker updates
5. the marker moves forward as `onend` advances the queue

### Progress Save

On each meaningful relocation:

- save `cfi`
- save `progress`
- save `spineItemId`
- save a short nearby text quote when available
- update `updatedAt`

## Error Handling

- selection auto-read failure:
  - translation still completes if possible
  - UI shows a lightweight TTS error only if needed
- active TTS marker cannot be positioned:
  - playback continues
  - marker is skipped for that segment
- `CFI` restore fails:
  - use `spineItemId + textQuote` fallback
- both restore strategies fail:
  - open from chapter start and surface that fallback in status text

## Testing Strategy

### Unit Tests

- selection de-duplication across translation and auto-read
- guardrails for when automatic selection TTS should not trigger
- TTS rate persistence from both settings and quick control updates
- progress record migration and fallback shape

### Integration Tests

- selected text auto-translates and auto-speaks once
- continuous TTS updates the active segment marker
- changing TTS speed in the panel persists to settings
- reopening a book restores by `CFI`, then falls back when needed

### Browser Tests

- selection in the iframe triggers translation and one automatic utterance
- continuous TTS advances across multiple segments and updates visible progress styling
- bookshelf `Continue reading` opens the last active book and location

## Acceptance Criteria

- selecting text triggers both translation and one automatic short-form TTS action
- continuous TTS visually marks the current spoken segment inside the reading surface
- users can adjust TTS speed from the settings page and the in-reader panel
- the bookshelf exposes a clear `Continue reading` entry point
- reopening a book restores progress reliably even when the original reader URL is gone
