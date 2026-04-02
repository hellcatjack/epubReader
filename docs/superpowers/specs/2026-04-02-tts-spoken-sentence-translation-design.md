# TTS Spoken Sentence Translation Design

## Goal

Add a wide-screen-only translation side note for continuous TTS playback so the reader can see the Chinese translation of the currently spoken sentence without changing the book layout or covering the main reading text.

## Background

The reader already supports:

- continuous TTS playback with sentence/segment highlighting
- manual translation in the Reading assistant rail
- transient selection translation bubbles for tablet-sized layouts

What is missing is a lightweight way to surface the translation of the sentence currently being spoken. The existing right rail is too far away from the active text, while any overlay that covers the正文 would directly harm reading comfort.

The design therefore favors a right-side margin note that follows the currently spoken sentence only when the viewport is wide enough to provide real spare space.

## Non-Goals

- No change to main reading text width or layout flow
- No new persistent history of spoken-sentence translations
- No explanation content, only translation
- No activation on tablet or narrow layouts
- No per-word or per-boundary translation requests

## User Experience

### Activation

The side note is enabled only when all of the following are true:

- continuous TTS is actively playing
- the viewport is in a wide-screen layout with meaningful right-side spare space
- the currently spoken sentence has a usable translation result

The side note is disabled entirely in tablet/narrow layouts such as the existing `1024px` reading-priority mode.

### Placement

The translation is rendered as a lightweight floating note in the right-side whitespace next to the main reading text:

- it does not overlap the main reading text
- it does not push or resize the main reading text
- it is visually tied to the vertical position of the currently spoken sentence
- it is clamped inside the safe viewport band so it does not collide with the top bar or bottom edge

### Content

The note shows:

- a subtle label like `Now reading`
- the Chinese translation of the current spoken sentence

The note does not repeat the English source sentence unless a future design explicitly asks for it. The translation should stay compact, ideally within 2 to 4 lines.

### Motion

The note may animate vertically with a short easing transition when the spoken sentence changes, but it must feel steady rather than chatty. If the translation is not available yet, the note remains hidden instead of showing a spinner.

### Failure Behavior

If the sentence cannot be translated or the request fails:

- no error banner is shown
- the side note simply stays hidden for that sentence

This keeps the reading surface calm.

## Architecture

### Sentence Source

The side note should be driven by the current spoken sentence, not by the raw chunk text and not by every word boundary.

The existing continuous TTS state already tracks the active marker text and position. The new design adds a derived `currentSpokenSentence` in `ReaderPage` using the active spoken text and the current location/runtime context. The sentence string is the unit that drives translation and UI updates.

### Translation Strategy

Sentence translation must be cached in memory for the current page session.

Suggested cache key:

- `bookId`
- `spineItemId`
- normalized sentence text

Suggested cache value:

- translated Chinese sentence
- optional in-flight state

This cache is intentionally ephemeral. It should not be written to IndexedDB because it is UI-session state, not durable reading data.

### Request Timing

Translation requests are triggered only when the spoken sentence changes. They are not triggered on every boundary event.

This avoids:

- model spam
- rate limit waste
- jittery UI updates

### Layout Gating

The feature should use a derived wide-screen capability check based on actual available right-side whitespace, not only `window.innerWidth`.

If the layout collapses or the spare space becomes too small, the side note disappears immediately.

## Components

### New Component

Create a dedicated presentational component for the side note. It should only render:

- label
- translated sentence
- anchored position styles

It should not fetch data itself.

### ReaderPage Integration

`ReaderPage` owns:

- whether the feature is enabled in the current layout
- the derived current spoken sentence
- the sentence translation cache
- side-note visibility
- anchor position calculation

This keeps data flow aligned with the existing TTS and translation orchestration.

### Runtime Positioning

The runtime already knows the active TTS segment location. Reuse that location to compute:

- the vertical anchor for the currently spoken sentence
- the right-side whitespace lane for note placement

The lane must be outside the main reading text box. If there is no safe lane, the feature does not render.

## Positioning Rules

### Horizontal Position

The note is placed to the right of the main reading text root with a fixed gap. Its width is constrained to a narrow readable band, roughly `220px` to `280px`.

### Vertical Position

The note tracks the active spoken sentence vertically, but the final top value is clamped to:

- stay below the top bar
- stay above the bottom safe area
- remain fully visible in the viewport

### Paginated vs Scrolled

The same side-note component is used in both reading modes, but position calculation differs:

- `scrolled`: anchor against the current visible sentence rectangle in the scrolling document
- `paginated`: anchor against the active sentence rectangle inside the current visible page band

## Filtering Rules

Do not show the side note for sentence candidates that are clearly not useful translation units, such as:

- empty strings
- pure numbering
- pure verse or footnote markers
- fragments that normalize to near-empty content

This keeps the feature meaningful in books like the ESV Bible.

## Testing Strategy

### Unit / Component

- side note renders only in wide layouts
- side note stays hidden in tablet layouts
- side note updates when the spoken sentence changes
- side note hides when TTS stops or pauses into idle
- side note does not render when the translation is missing or the sentence is ignorable

### ReaderPage Integration

- sentence changes trigger exactly one translation request per new sentence
- repeated visits to the same sentence reuse the in-memory cache
- layout resize from wide to tablet hides the note
- layout resize from tablet back to wide can resume showing the note for the active sentence

### Positioning

- the side note never overlaps the main reading text box
- the side note stays inside top and bottom safe bounds
- the side note follows the active sentence rather than staying fixed in one corner

### Browser-Level

- wide-screen continuous TTS shows the note beside the main reading text
- `1024px` layout does not show it
- both `scrolled` and `paginated` modes keep the note outside the正文 while updating correctly

## Rollout Notes

This should be shipped as a default-on wide-screen enhancement with no user setting initially. The gating by available space is enough, and adding a setting now would increase UI complexity without proving value first.
