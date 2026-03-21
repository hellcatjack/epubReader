# Reader Navigation and Library Shell Design

**Date:** 2026-03-20

## Summary

Upgrade the app from two loosely connected pages into a shared reader application shell with persistent global navigation.

The new shell keeps `Library`, `Import EPUB`, and `Settings` available while reading. The library becomes a reusable overlay workspace instead of a page-only entry point. Importing a new book from any screen opens that book immediately while preserving the previous book's saved progress.

## Problem

The current app splits core navigation between:

- `BookshelfPage`, which owns `Import EPUB` and `Settings`
- `ReaderPage`, which owns only reading controls

Once the user opens a book, the system-level actions disappear. That creates two product problems:

- Readers cannot import a new EPUB without leaving the reading workflow
- The app feels like a bookshelf page plus a separate reader page, not a mature ebook reader with persistent navigation

## Goals

- Keep `Library`, `Import EPUB`, and `Settings` reachable from both bookshelf and reader routes
- Let users open the library without losing the current reading context
- Let users import a new EPUB while reading
- Open the newly imported book immediately after a successful import
- Preserve the current book's saved progress when switching books
- Separate system navigation from reading controls so the UI hierarchy is clearer

## Non-Goals

- Add cloud sync, collections, tags, or advanced search
- Redesign the left reader rail or right reader tools panel
- Change the core import pipeline or book metadata model
- Replace the existing reading progress persistence model

## Proposed Product Model

The app becomes a shell with two workspaces:

- `Library workspace`
- `Reader workspace`

Both routes render inside a shared `ReaderAppShell`.

The shell owns:

- global top navigation
- import flow
- settings dialog visibility
- library drawer visibility
- current book summary shown in the shell header

The inner route owns only its own content:

- `BookshelfPage` becomes a reusable library content panel
- `ReaderPage` remains focused on reading behavior and reading controls

## Routing and Layout

Routes remain stable:

- `/` renders the library workspace
- `/books/:bookId` renders the reader workspace

What changes is the frame around them:

- `AppShell`
  - global header
  - optional `LibraryDrawer`
  - route content outlet

This keeps deep links and current routing semantics intact while giving the whole app one navigational system.

## Global Header

The new shell header has three zones.

### Left Zone

- product label
- `Library` button

The `Library` button opens the overlay drawer on the reader route and acts as the primary route affordance for the bookshelf.

### Center Zone

Shows contextual state:

- on `/`: `Your library`
- on `/books/:bookId`: current book title, author, and reading progress label when available

This gives the app a stable “currently reading” identity without turning the reading toolbar into system chrome.

### Right Zone

- `Import EPUB`
- `Settings`

These are global actions, so they move out of the bookshelf hero and into the shell.

## Library Drawer

The library is no longer only a page. It becomes a reusable overlay workspace.

### Behavior

- On the reader route, `Library` opens a non-destructive overlay drawer
- The drawer contains the same library content model as the bookshelf route:
  - continue-reading card
  - local books list
  - delete action
  - open-book action
- Opening a book from the drawer navigates to that book and closes the drawer
- The current book remains open underneath until the route actually changes

### Presentation

- Desktop: a wide side drawer that overlays part of the reading workspace
- Narrow screens: a full-width sheet
- Scrollable internally
- Distinct header and close affordance

This should feel like an app workspace, not a temporary alert-style modal.

## Import Flow

Import is centralized in the shell.

### Flow

1. User activates `Import EPUB` from the global header
2. Shell triggers the file input and runs the existing import pipeline
3. On success, shell refreshes library data
4. Shell navigates to `/books/:newBookId`
5. Shell closes the library drawer if it is open

### User Decision

The chosen behavior is immediate open:

- importing a book while reading opens the new book right away
- the previously open book keeps its persisted progress through the existing save flow

### Error Handling

- Import failure does not disturb the active reading surface
- Error is surfaced in shell-level UI near the header or inside the drawer
- The user can retry without leaving the current route

## Settings Access

`Settings` becomes a global shell action and continues to reuse the existing `SettingsDialog`.

This keeps settings discoverable from both bookshelf and reader contexts and removes the current route asymmetry.

## Reader Toolbar Boundary

`TopBar` inside `ReaderPage` remains a reading control surface, not a system navigation bar.

It continues to own:

- reading mode toggle
- page controls
- bookmark action
- selection actions

It no longer needs to carry system navigation responsibilities. That separation clarifies the product hierarchy:

- shell header = app navigation
- reader top bar = reading controls

## Component Boundaries

### New Shell Layer

Add a shared shell component, for example:

- `ReaderAppShell`

Responsibilities:

- render the global header
- manage hidden file input for imports
- manage library drawer visibility
- manage settings dialog visibility
- load and refresh bookshelf summaries
- expose current-book summary to the header

### Bookshelf Refactor

Refactor `BookshelfPage` toward a reusable library content component.

Preferred structure:

- `LibraryPanel`
  - pure content for continue-reading and local books
- `BookshelfPage`
  - route wrapper that renders `LibraryPanel` in full-page mode
- `LibraryDrawer`
  - drawer wrapper that renders `LibraryPanel` in overlay mode

This avoids duplicating library UI between the bookshelf route and the reader overlay.

### Reader Integration

`ReaderPage` should expose enough current-book metadata for the shell header:

- title
- author
- progress label or percentage

This can come from bookshelf data keyed by `bookId`, not from the reader runtime itself, so shell navigation stays independent from EPUB rendering internals.

## State Model

Shell-owned UI state:

- `isLibraryOpen`
- `isSettingsOpen`
- `isImporting`
- `importError`
- `libraryItems`
- `currentBookSummary`

Reader-owned state remains unchanged for:

- location
- annotations
- TTS
- translation and explanation
- reading preferences

This keeps system navigation concerns out of `ReaderPage`.

## Testing Strategy

### Component Tests

- Shell renders global actions on both `/` and `/books/:bookId`
- `Library` opens and closes the drawer
- Import from the reader route opens the imported book
- Settings remain accessible from the reader route

### Library Content Tests

- Reusable library content works both as full page and drawer content
- Continue-reading surface still selects the most recently read book
- Opening and deleting books still work through the shared content component

### Reader Integration Tests

- Existing reading controls in `TopBar` still work
- Reader route still supports translation, notes, TTS, and pagination after shell integration

### Playwright

- Start on a reader route, open `Library`, switch to another book
- Start on a reader route, import a new EPUB, verify immediate navigation to the new book
- Open settings from the reader route

## Acceptance Criteria

- A reader can import a new EPUB without leaving the reading route
- A reader can open the library while staying inside the reading experience
- Importing a new book opens it immediately
- Existing reading progress persists when switching away from the current book
- The app presents one coherent navigation system across bookshelf and reader routes
