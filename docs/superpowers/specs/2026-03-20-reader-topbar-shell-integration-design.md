# Reader TopBar Shell Integration Design

**Date:** 2026-03-20

## Summary

Refine the new navigation shell so the reader route behaves like a mature ebook reader instead of a page wrapped by a second app header.

The reader route should use one top control surface, not two. `Library`, `Import EPUB`, and `Settings` stay available while reading, but they move into the existing reader `TopBar`. The library drawer is restyled for narrow widths so it never depends on horizontal scrolling.

## Problems

The first shell iteration introduced two product issues:

- the new sticky shell header sits above the existing reader `TopBar`, consuming too much vertical space and pushing the reading surface down
- the library drawer reuses the full-page bookshelf layout too literally, which is brittle in constrained widths and can produce incomplete presentation or horizontal overflow when book metadata is longer

These are integration issues, not reasons to remove shared navigation entirely.

## Goals

- keep `Library`, `Import EPUB`, and `Settings` available while reading
- return the reader route to a single top control surface
- recover vertical space for the book content
- ensure the library drawer never requires horizontal scrolling
- preserve the shared import, settings, and library state already owned by `ReaderAppShell`

## Non-Goals

- redesign the bookshelf home route
- remove the reusable library drawer concept
- change import behavior or bookshelf persistence
- redesign reader side rails, TTS layout, or annotation panels beyond what is needed for this integration

## Product Model

The shell remains responsible for global state:

- library data
- import flow
- settings visibility
- library drawer visibility

But on the reader route, shell actions are rendered by `ReaderPage` inside the existing `TopBar`.

That means:

- `/` keeps the shell-level library workspace presentation
- `/books/:bookId` stops rendering the shell header
- `ReaderPage` reads shell actions from outlet context and injects them into `TopBar`

## Reader Route Layout

On the reader route:

- remove the sticky shell header entirely
- keep only the reader `TopBar`
- merge `Library`, `Import EPUB`, and `Settings` into the same actions row as reading controls

This restores the original visual hierarchy:

- one top bar for everything the reader needs immediately
- content begins directly under that bar
- right-side tools stay aligned to the single top offset instead of compensating for a second shell header

## Library Drawer Presentation

The drawer should become a true reading-side workspace, not a squeezed bookshelf page.

### Layout Rules

- force internal width containment with `max-width: 100%` and `overflow-x: hidden`
- use a single-column content flow in drawer mode
- let long titles and metadata wrap instead of expanding card width
- allow action rows to wrap cleanly
- use a narrower, more compact spacing scale than the full-page library

### Behavior

- drawer stays overlay-only on the reader route
- open-book still navigates and closes the drawer
- delete still refreshes library data and preserves the current route unless the current book is deleted

## Component Boundaries

### ReaderAppShell

Keeps ownership of:

- `handleLibraryClick`
- `handleImportFile`
- settings and drawer open state
- current library data

Adds a route-aware rendering split:

- render `AppHeader` only on `/`
- provide reader-route shell actions through outlet context on `/books/:bookId`

### ReaderAppShellContext

Expands from an empty type into a small interface that exposes:

- current book summary
- library/settings open state
- import busy state
- handlers for `Library`, `Import EPUB`, and `Settings`

This lets `ReaderPage` consume shell actions without taking over shell state ownership.

### ReaderPage and TopBar

`ReaderPage` reads shell context and passes a `systemActions` slot into `TopBar`.

`TopBar` becomes the only top-level action surface on the reader route. It still owns reading controls, but now also renders shell actions in a visually secondary cluster.

## Testing Strategy

### Component Tests

- reader route should no longer render the shell header
- reader route `TopBar` should render `Library`, `Import EPUB`, and `Settings`
- home route should still render the shell header
- opening the library drawer should not create horizontal overflow in drawer mode

### Browser Tests

- on the reader route, the top of the book content should sit noticeably closer to the viewport top than in the dual-header version
- opening the library drawer on a narrow viewport should keep `documentElement.scrollWidth === clientWidth`
- importing and opening settings from the reader `TopBar` should still work

## Recommendation

Keep the shared shell architecture, but stop showing a separate shell header on the reader route.

That preserves the product goal of persistent navigation while restoring the ergonomics of a real ebook reader: one control bar, more space for the page, and a drawer that behaves like a tool panel instead of a cramped bookshelf page.
