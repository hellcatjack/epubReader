# TTS Follow Playback Paging Design

Date: 2026-03-28

## Goal

Fix `Follow TTS playback` so it behaves like page turning rather than continuous tracking.

The current behavior has two failures:

- `paginated mode` can fail to turn the page at all.
- `scrolled mode` keeps dragging the active highlight back toward the top, which causes visible jitter and makes the page unreadable while TTS is running.

The desired behavior is:

- `paginated mode`: do not move while the active spoken text is still on the current page; turn exactly one page when the spoken text moves to the next page.
- `scrolled mode`: do not continuously scroll to follow the highlight; keep the page still while the active spoken text remains fully visible on the current screen; when the spoken text reaches the bottom page band, move down by one full viewport-height page and then keep the page still again.

## Constraints

- The active spoken highlight must never be left half inside and half outside the visible page after an automatic page move.
- Existing `Follow TTS playback = off` behavior must remain unchanged.
- Existing paginated keyboard and wheel pagination behavior must remain unchanged.
- The new logic must not rely on browser `boundary` support to make page moves.

## Recommended Approach

Use separate page-band logic for `paginated` and `scrolled`.

### Why this approach

The current implementation is built on the idea of revealing the active TTS element. That model is acceptable for a one-off “show me this element” interaction, but it is the wrong abstraction for continuous reading flow. It produces the exact failure modes the user reported:

- element-level reveal in paginated mode is less reliable than explicit page-index movement
- element-level reveal in scrolled mode creates jitter because it repositions the viewport on every highlight update

The correct abstraction is page ownership:

- determine whether the active highlight still belongs to the current visible page-band
- move only when it exits that page-band
- when moving, move by pages rather than by element alignment

## Design

### 1. Paginated follow playback

When `Follow TTS playback` is enabled and the reading mode is `paginated`:

- Treat the current page as a horizontal page-band derived from the container `scrollLeft` and `clientWidth`.
- When the active spoken highlight updates, compute whether its rect is still fully inside that page-band.
- If it is fully inside, do nothing.
- If it falls into the next page-band, increment the page index by the minimum number of pages needed to make the highlight fully visible.
- If it falls into a previous page-band, decrement the page index similarly.
- Do not use `scrollIntoView()` as the primary paginated follow mechanism.

This makes page advancement deterministic and independent of layout quirks from element-level reveal behavior.

### 2. Scrolled follow playback

When `Follow TTS playback` is enabled and the reading mode is `scrolled`:

- Define the current screen page-band as the reader container’s visible vertical viewport.
- Keep the viewport still while the active spoken highlight remains fully inside that page-band.
- Define a bottom safety band near the end of the current screen. If the active spoken highlight crosses that safety band, advance by one full screen page:
  - new `scrollTop = current scrollTop + clientHeight`
- After each page move, verify that the active highlight is now fully visible.
- If the highlight is still partially out of view because of tall blocks or large line boxes, move by one more full screen page until the highlight is fully visible.
- Do not continuously pin the highlight to the top reading line.

This produces screen-by-screen advancement instead of micro-scrolling.

### 3. Highlight visibility rule

Both reading modes use the same visibility requirement:

- the active spoken rect must be fully contained inside the visible page-band after any automatic move
- partial visibility is not acceptable

For `scrolled mode`, the top and bottom safety bands should be slightly inset from the raw viewport edges so the highlight does not sit flush against the boundary.

### 4. TTS chunking

Paginated continuous playback should continue using chunk splitting that does not depend on `boundary` to trigger the next page. The page turn decision must happen on active spoken segment updates and on chunk transitions, so browsers with poor `boundary` support still advance correctly.

## Files Affected

- `src/features/reader/epubRuntime.ts`
  - replace element-reveal-driven follow playback with page-band-driven follow playback
- `src/features/reader/ReaderPage.tsx`
  - keep paginated follow chunking compatible with page-band advancement
- `tests/e2e/local-tts.spec.ts`
  - add or update regressions for paginated no-boundary follow and scrolled full-screen follow
- `src/features/reader/epubRuntime.test.ts`
  - add page-band decision tests for both reading modes

## Testing

### Unit tests

- paginated follow does nothing when the active rect remains fully inside the current page-band
- paginated follow advances exactly one page when the active rect moves into the next page-band
- scrolled follow does nothing while the active rect remains fully inside the current screen page-band
- scrolled follow advances by one full visible screen when the active rect crosses the bottom safety band
- scrolled follow never leaves the active rect partially clipped after an automatic page move

### Playwright tests

- `paginated mode follow playback automatically turns to the next page`
- `paginated follow playback turns the page even without boundary events`
- `scrolled mode follow playback advances by full screens instead of jittering`

### Production smoke test

Run a live smoke test against `https://ushome.amycat.com:18025` to verify:

- paginated follow playback moves `scrollLeft` by page width
- scrolled follow playback keeps the screen still during in-page reading and then advances by full screen height

## Out of Scope

- adding animation controls for the automatic page turn
- adding a separate “follow only in paginated mode” preference
- changing TTS voice, queue, or highlight styling
