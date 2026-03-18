# EPUB Reader Home and TTS UI Design

**Date:** 2026-03-18

## Summary

Refine the EPUB reader's top-level UI so the product feels like a real reading app instead of a stack of forms.

This design covers two linked improvements:

- convert the bookshelf landing screen into a cleaner, bookshelf-first home page with a right-side settings trigger instead of an inline settings form
- redesign the reader-side `TTS queue` panel so playback controls, voice selection, and speed/volume settings feel cohesive and compact

The change is intentionally UI-focused. It reuses the current settings persistence model, browser-native TTS integration, and reader route structure.

## Product Goal

The product should feel easier to read and easier to control:

- the home page should prioritize books, importing, and resume flow
- settings should be accessible without visually dominating the landing screen
- the in-reader TTS controls should feel like a compact playback console
- voice selection should live near the TTS controls where it matters most

## Scope

### In Scope

- bookshelf home layout refresh
- right-top settings trigger on the home page
- grouped settings panel with common settings visible first and advanced settings collapsed
- stronger `Continue reading` presentation
- improved import affordance on the home page
- redesigned `TTS queue` card in the reader
- move `TTS voice` selection into the `TTS queue` card
- constrain TTS control widths so the right rail stays visually stable

### Out of Scope

- changing the current routing model
- new account or sync features
- rewriting settings persistence
- redesigning the full reader page layout outside the TTS control area
- changing the actual TTS engine or translation engine

## Architecture

### High-Level Shape

The implementation should stay inside the existing front-end architecture:

- `BookshelfPage` remains the landing page route
- `SettingsDialog` remains the source of truth for settings state and persistence
- `ReaderPage` remains responsible for TTS playback and in-reader settings reactions
- browser TTS voice discovery still comes from `speechSynthesis`

The main change is decomposition of settings UI presentation:

- the same settings logic should support a bookshelf overlay/panel presentation
- the reader's TTS-specific controls should move closer to playback state instead of living only in the general settings surface

## Home Page Design

### Visual Direction

The landing page should feel like a bookshelf-first product:

- primary focus on `Continue reading`
- secondary focus on importing new books
- the local bookshelf grid remains visible and easy to scan
- settings move out of the main reading flow and into a contextual action

The current warm, paper-like palette can remain, but the structure should be more editorial and less form-heavy.

### Layout

The home page should be organized into three visible layers:

1. top header
2. continue reading hero card
3. local books grid

#### Header

The header should include:

- product title
- a short product description
- a prominent `Import EPUB` action
- a secondary `Settings` action aligned to the right

The raw file input should no longer appear as a naked form field. The upload interaction should be button-driven with the hidden file input still used under the hood.

#### Continue Reading

If a recent book exists, it should render as a large hero card with:

- title
- author
- current progress label
- direct `Continue reading` action

This section should be visually stronger than the book grid, because it is the most important re-entry path.

#### Local Books

The bookshelf list should remain a grid of book cards, but the section should sit below the hero card and read as the browsing area rather than the first thing users must parse.

## Home Settings Panel

### Interaction Model

The home page settings surface should become a toggleable panel opened by a right-side `Settings` button.

The settings panel may render as a floating popover, anchored sheet, or compact drawer, but it must:

- open without navigating away from the bookshelf
- close quickly without disrupting the page
- remain usable on both desktop and narrower widths

### Information Architecture

The panel should be split into:

- `Common`
- `Advanced typography`

#### Common

The default visible group should contain:

- `Target language`
- `Theme`
- `Reading mode`
- `TTS voice`
- `TTS rate`

#### Advanced Typography

The collapsed advanced group should contain:

- `Font family`
- `Font scale`
- `Line height`
- `Letter spacing`
- `Paragraph spacing`
- `Paragraph indent`
- `Content padding`
- `Max line width`
- `Column count`

This keeps the first-open experience compact while still exposing the full settings set.

## Reader TTS Queue Design

### Structural Goal

The reader-side `TTS queue` should feel like a playback module, not a miscellaneous settings box.

It should move above `Appearance` and organize controls into a compact vertical stack.

### Content Order

The recommended order is:

1. playback status and current spoken text
2. playback action row
3. playback settings row

#### Playback Status

The top of the card should continue to show:

- queue state
- current segment text preview
- any lightweight browser-specific availability note

#### Action Row

The action row should contain:

- `Start`
- `Pause`
- `Resume`
- `Stop`

These controls should remain easy to hit but not force the panel to become overly wide.

#### Playback Settings Row

The settings row should contain:

- `Voice`
- `Rate`
- `Volume`

`Voice` belongs here because it directly affects the playback session and users will expect to adjust it where they manage TTS.

## Control Width Rules

The right rail should not be stretched by form controls.

Recommended width behavior:

- `Voice` select:
  - wider than the rest
  - constrained to a fixed comfortable range, around `12rem` to `14rem`
- `Rate` input/select:
  - compact, around `5rem` to `6rem`
- `Volume` input/select:
  - compact, around `5rem` to `6rem`
- playback buttons:
  - wrap cleanly when needed
  - do not force a single unbroken row at small widths

This keeps the card readable and prevents the rail from feeling like a stretched form.

## Settings Ownership

### Shared Settings

The system should continue using the existing shared settings store.

That means:

- changing `TTS voice` in the reader writes back to the same settings persistence used by the home page
- changing `TTS rate` or `TTS volume` in the reader also persists globally
- the home panel and reader panel stay in sync through shared storage plus current session state

### Presentation Split

The settings data model does not need to split. Only the UI presentation changes:

- general reading/system settings remain in the settings surface
- TTS-session-adjacent controls become accessible inside `TTS queue`

This avoids duplicate state models and keeps behavior predictable.

## Data Flow

### Home Page Settings

1. user opens the home settings panel
2. current persisted settings populate the grouped form
3. user edits a common or advanced field
4. save persists through the existing settings repository
5. new values are immediately available to future reader sessions

### Reader TTS Queue

1. reader loads current persisted TTS settings
2. `TTS queue` resolves available browser voices
3. user changes `voice`, `rate`, or `volume`
4. reader updates session state and persists the shared settings
5. current or future playback uses the new values according to existing TTS behavior

## Error Handling

- browser voices unavailable:
  - keep current warning copy
  - do not break the panel layout
- settings panel fails to load voices:
  - render the rest of the panel
  - fall back to current saved voice label where possible
- narrow viewport:
  - action rows and compact inputs should wrap instead of overflowing
- save failure:
  - retain current error/status messaging strategy
  - do not silently discard user changes

## Testing Strategy

### Unit and Component Tests

- bookshelf page renders a settings trigger instead of the inline full settings block
- clicking the trigger opens and closes the settings panel
- common settings are visible by default
- advanced typography settings are hidden until expanded
- reader `TTS queue` renders `voice`, `rate`, and `volume` in the same card
- compact width classes/structure are applied to the TTS controls

### Integration Tests

- changing `TTS voice` in the reader persists and is reflected in settings
- changing `TTS rate` in the home panel persists and appears in the reader
- import flow remains functional after the home page layout refactor

### Browser Tests

- bookshelf page still imports an EPUB and navigates into the reader
- home settings panel opens, changes a value, and closes successfully
- reader right rail shows `TTS queue` above `Appearance`

## Acceptance Criteria

- the bookshelf landing screen no longer shows an always-open settings form
- users can open a grouped settings panel from the home page header
- `Continue reading` remains prominent and easier to scan
- `Import EPUB` feels like a clear primary action rather than a raw file input
- the reader `TTS queue` presents playback controls plus `voice/rate/volume` in one compact card
- TTS controls no longer visually stretch the right rail
- settings remain persisted and synchronized between home and reader surfaces
