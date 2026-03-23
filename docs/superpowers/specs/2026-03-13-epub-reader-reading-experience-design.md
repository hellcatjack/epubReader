# EPUB Reader Reading Experience Upgrade Design

**Date:** 2026-03-13

## Summary

Upgrade the current EPUB reader from a basic MVP shell into a usable desktop reading surface with stable page navigation, reliable text selection, and live typography controls.

This upgrade adds two reading modes, true page-turn controls, preserved text selections, and reader-grade layout customization without changing the local-first product boundary.

## Product Goal

The reader must feel like a real EPUB reading tool rather than a demo viewer:

- books open into a readable surface
- desktop users can move through books predictably
- selecting text does not fight with reading gestures
- typography changes are visible immediately and persist locally

## Scope

### In Scope

- dual reading modes:
  - `scrolled`
  - `paginated`
- mode persistence across sessions
- page navigation in paginated mode:
  - keyboard shortcuts
  - left/right click zones
  - explicit next/previous controls
- text-selection-first interaction model
- live typography controls for:
  - font size
  - line height
  - letter spacing
  - paragraph spacing
  - paragraph indent
  - content padding
  - maximum line width
  - column count
  - font family
- reader-side settings UI with basic and advanced groups
- first-open behavior that prefers the first body chapter instead of the cover/front matter
- persistence for all new reader preferences

### Out of Scope

- TTS improvements
- cloud sync
- mobile-first tuning
- fixed-layout EPUB support
- image/layout heuristics beyond "do not overflow"
- per-book custom themes in this phase

## Current Gaps

The existing reader can open EPUB files and expose AI and annotation actions, but several core reading interactions are still below reader-quality:

- paginated mode renders but has no navigation commands wired into the UI
- text selection is unstable because the runtime clears the native selection immediately after capture
- typography persistence is limited to theme and a single font scale
- the current settings UI lives on the bookshelf, not in the reading workflow
- first open can land on cover or front matter instead of the first real reading chapter

## Reading Principles

- Selection beats page turning. If the user is dragging to select text, the app must not interpret that gesture as navigation.
- Mode switching must not lose position.
- Typography must update fast enough to feel live.
- Reader controls belong inside the reading workflow, not behind a bookshelf-only settings surface.
- Defaults should favor usability over theoretical purity:
  - first use should prefer stable text selection
  - desktop pagination should remain one click away

## Interaction Model

### Reading Modes

- Supported modes:
  - `scrolled`
  - `paginated`
- First open uses `scrolled`
- After that, the app restores the last used mode from local settings
- Switching mode keeps the current CFI anchor and re-renders around it

### Page Navigation

In `paginated` mode:

- `ArrowRight`, `PageDown`, and `Space` move forward
- `ArrowLeft`, `PageUp`, and `Shift+Space` move backward
- left and right page-edge hotspots trigger previous/next page
- explicit previous/next buttons exist in the reader toolbar

In `scrolled` mode:

- there are no click hotspots
- scrolling is native
- keyboard page-turn shortcuts are disabled or mapped to viewport scrolling only when needed

### Text Selection

- Once pointer drag selection begins, page-turn hotspots must not fire
- The runtime must not call `removeAllRanges()` immediately after selection capture
- Selection remains visible until the user clears it or performs an action that explicitly dismisses it
- Selection popover actions continue to use the captured range metadata

### First Open Behavior

When a book has no saved progress:

- the reader resolves the first likely body chapter from the spine / navigation structure
- it prefers the first non-front-matter content section over cover, title page, copyright, or dedication
- if heuristics fail, it falls back to the EPUB default start point

## Reader Architecture Changes

## Reader Session Layer

The current `epubRuntime` is too narrow. It only opens a book and reports relocation/selection changes. This upgrade expands it into a more capable reader-session boundary that owns:

- active rendition instance
- current flow mode
- next / previous page commands
- typography application
- selection handling policy
- current location reporting

The UI should continue to talk to a single runtime/session interface instead of reaching into `epub.js` directly.

### Expanded Runtime Contract

The runtime/session interface must expose:

- `render()`
- `destroy()`
- `next()`
- `prev()`
- `setFlow("scrolled" | "paginated")`
- `applyPreferences(preferences)`
- `goTo(targetCfiOrHref)`

This lets `ReaderPage` own user intent while the runtime owns EPUB engine behavior.

## Typography Model

Typography is applied at two levels:

### Host-Level Layout CSS

The outer app shell controls:

- content max width
- padding around the page surface
- single vs dual columns in paginated mode
- panel spacing and overall reading density

### EPUB Content Overrides

The EPUB rendition applies overrides through `rendition.themes.override()` for:

- `font-size`
- `line-height`
- `letter-spacing`
- `font-family`
- paragraph margins
- paragraph indent

The rule is simple: use host CSS for container geometry, use rendition theme overrides for text inside the book.

## Reader Settings Model

The existing settings schema grows from a small global profile into a real reader-preference set.

Required fields:

- `readingMode: "scrolled" | "paginated"`
- `fontScale: number`
- `lineHeight: number`
- `letterSpacing: number`
- `paragraphSpacing: number`
- `paragraphIndent: number`
- `contentPadding: number`
- `maxLineWidth: number`
- `columnCount: 1 | 2`
- `fontFamily: "serif" | "sans" | "book"`

Recommended defaults:

- `readingMode: "scrolled"`
- `fontScale: 1`
- `lineHeight: 1.7`
- `letterSpacing: 0`
- `paragraphSpacing: 0.85`
- `paragraphIndent: 1.8`
- `contentPadding: 32`
- `maxLineWidth: 760`
- `columnCount: 1`
- `fontFamily: "book"`

## Reader Settings UI

Reader appearance controls move into the reading screen.

- The right panel gets a new `Appearance` section
- The section has:
  - common controls:
    - mode
    - font size
    - line height
    - theme
  - advanced controls:
    - letter spacing
    - paragraph spacing
    - paragraph indent
    - page padding
    - max line width
    - column count
    - font family

The bookshelf-level settings UI remains for global/local configuration, but reading controls must be operable without leaving the book.

## Compatibility Rules

- Dual-column mode is only enabled when:
  - mode is `paginated`
  - viewport width is large enough
- `columnCount = 2` silently degrades to `1` in `scrolled` mode
- Typography values are clamped to safe ranges before applying them to the rendition
- If a pre-paginated or unusual spine item refuses some overrides, the reader preserves readability instead of forcing every rule

## Error Handling

- If mode switch fails, keep the previous mode and show a non-blocking reader error
- If a typography override fails, keep the last known-good applied settings
- If the first-body-chapter heuristic fails, open the EPUB default start and do not block reading
- If selection capture produces text but no stable range metadata, allow AI explanation/translation but disable highlight/note creation for that selection

## Testing Strategy

### Unit and Integration

- settings migration and default resolution
- runtime/session navigation commands
- mode switching with location preservation
- typography preference serialization and application
- bookmark toggle behavior
- selection persistence without forced clearing

### Browser E2E

- import a book and enter the first reading chapter
- switch between scrolled and paginated modes
- page forward and backward in paginated mode
- drag-select text without accidental page turn
- adjust typography and observe visible persisted changes

### Real-Book Validation

Use `The_Barren_Grounds_(The_Misewa_Saga_01)...epub` as a real validation book for:

- first-open chapter targeting
- paginated page turns
- selection stability
- typography controls under long-form prose

## Acceptance Criteria

- Users can switch between `scrolled` and `paginated` modes without losing place
- Paginated mode supports keyboard and mouse page turning
- Mouse drag selection does not auto-clear or misfire into page navigation
- Appearance settings update live and persist after refresh
- First open lands in a body chapter instead of front matter in common novel EPUBs
- The real-book flow on `http://localhost:5173/` remains stable
