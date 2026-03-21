# Reader Navigation and Library Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared app shell so `Library`, `Import EPUB`, and `Settings` stay available while reading, with a reusable library drawer that can switch books or import a new book without leaving the reader workflow.

**Architecture:** Wrap the bookshelf and reader routes in a shared `ReaderAppShell` that owns global navigation, import/settings state, and library data. Refactor the bookshelf UI into a reusable `LibraryPanel` rendered both as the `/` workspace and as an overlay drawer on `/books/:bookId`, while keeping `ReaderPage` focused on reading controls and EPUB behavior.

**Tech Stack:** React 19, TypeScript, React Router, Dexie, epub.js, Vitest, Playwright, Vite

---

## File Map

- Create: `src/app/ReaderAppShell.tsx` — shared shell that owns global header, import flow, library drawer, settings panel, and outlet context
- Create: `src/app/AppHeader.tsx` — global navigation header with `Library`, `Import EPUB`, `Settings`, and current book summary
- Create: `src/app/LibraryDrawer.tsx` — overlay workspace wrapper for the reusable library content
- Create: `src/app/readerAppShell.css` — shell header, drawer, and workspace styling
- Create: `src/app/readerAppShellContext.ts` — typed outlet context for shell-owned library actions and data
- Create: `src/app/ReaderAppShell.test.tsx` — shell-level route and interaction coverage
- Create: `src/features/bookshelf/LibraryPanel.tsx` — reusable library content shared by full-page and drawer modes
- Create: `src/features/bookshelf/LibraryPanel.test.tsx` — focused behavior tests for reusable library content
- Create: `tests/e2e/navigation-shell.spec.ts` — browser-level coverage for reader-route library access, import, and settings
- Modify: `src/app/router.tsx` — nest bookshelf and reader routes under the shared shell
- Modify: `src/app/App.test.tsx` — route smoke tests for the new shell
- Modify: `src/features/bookshelf/BookshelfPage.tsx` — thin route wrapper around `LibraryPanel`
- Modify: `src/features/bookshelf/BookshelfPage.test.tsx` — move import/settings expectations out of the page and keep library-page expectations
- Modify: `src/features/bookshelf/bookshelf.css` — split page-specific library styles from reusable panel styles
- Modify: `src/features/settings/SettingsPanel.tsx` — ensure shell-owned settings can open over both page and reader workspaces
- Modify: `src/features/reader/reader.css` — small layout adjustments so the shell header and drawer coexist cleanly with the reader grid

## Chunk 1: Shared Shell Skeleton

### Task 1: Add a shell route wrapper and prove it renders on both workspaces

**Files:**
- Create: `src/app/ReaderAppShell.tsx`
- Create: `src/app/readerAppShellContext.ts`
- Create: `src/app/ReaderAppShell.test.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/app/App.test.tsx`

- [ ] **Step 1: Write the failing route tests**

Add shell-level tests that render `/` and `/books/book-1` and assert a shared app-level banner exists on both routes.

Example assertions:

```tsx
expect(screen.getByRole("banner", { name: /app navigation/i })).toBeInTheDocument();
expect(screen.getByRole("button", { name: /library/i })).toBeInTheDocument();
expect(screen.getByRole("button", { name: /import epub/i })).toBeInTheDocument();
expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
```

- [ ] **Step 2: Run the route tests to verify they fail**

Run: `npm test -- src/app/App.test.tsx src/app/ReaderAppShell.test.tsx`

Expected: FAIL because the shared shell does not exist and the router still renders the two pages directly.

- [ ] **Step 3: Implement the minimal shell wrapper**

Create `ReaderAppShell.tsx` with:
- a shell banner placeholder
- placeholder `Library`, `Import EPUB`, and `Settings` buttons
- an `Outlet`

Update `router.tsx` so `/` and `/books/:bookId` are nested under the shell route.

- [ ] **Step 4: Re-run the route tests**

Run: `npm test -- src/app/App.test.tsx src/app/ReaderAppShell.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit the shell skeleton**

```bash
git add src/app/ReaderAppShell.tsx src/app/readerAppShellContext.ts src/app/ReaderAppShell.test.tsx src/app/router.tsx src/app/App.test.tsx
git commit -m "feat: add shared reader app shell"
```

## Chunk 2: Reusable Library Content

### Task 2: Extract a reusable library panel from the bookshelf page

**Files:**
- Create: `src/features/bookshelf/LibraryPanel.tsx`
- Create: `src/features/bookshelf/LibraryPanel.test.tsx`
- Modify: `src/features/bookshelf/BookshelfPage.tsx`
- Modify: `src/features/bookshelf/BookshelfPage.test.tsx`
- Modify: `src/features/bookshelf/bookshelf.css`

- [ ] **Step 1: Write the failing library-content tests**

Add tests that cover:
- `LibraryPanel` renders the continue-reading card and local books list
- `LibraryPanel` calls `onOpenBook` and `onDeleteBook`
- `BookshelfPage` becomes a thin route wrapper around reusable content instead of owning import/settings actions

Example callback assertion:

```tsx
await user.click(screen.getByRole("button", { name: /open book minimal valid epub/i }));
expect(onOpenBook).toHaveBeenCalledWith("book-1");
```

- [ ] **Step 2: Run the library tests to verify they fail**

Run: `npm test -- src/features/bookshelf/LibraryPanel.test.tsx src/features/bookshelf/BookshelfPage.test.tsx`

Expected: FAIL because `LibraryPanel` does not exist and `BookshelfPage` still owns page-local import/settings behavior.

- [ ] **Step 3: Implement the minimal reusable library content**

Create `LibraryPanel.tsx` to render:
- continue-reading card
- local books grid
- empty-state copy when needed

Refactor `BookshelfPage.tsx` to:
- become the full-page library workspace wrapper
- render `LibraryPanel`
- stop owning `Import EPUB` and `Settings`

Move any shared visual rules from page-only CSS into reusable `LibraryPanel` styles.

- [ ] **Step 4: Re-run the library tests**

Run: `npm test -- src/features/bookshelf/LibraryPanel.test.tsx src/features/bookshelf/BookshelfPage.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit the library refactor**

```bash
git add src/features/bookshelf/LibraryPanel.tsx src/features/bookshelf/LibraryPanel.test.tsx src/features/bookshelf/BookshelfPage.tsx src/features/bookshelf/BookshelfPage.test.tsx src/features/bookshelf/bookshelf.css
git commit -m "refactor: extract reusable library panel"
```

## Chunk 3: Global Navigation, Import, and Settings

### Task 3: Move import and settings to the shell and wire them on the reader route

**Files:**
- Create: `src/app/AppHeader.tsx`
- Create: `src/app/LibraryDrawer.tsx`
- Create: `src/app/readerAppShell.css`
- Modify: `src/app/ReaderAppShell.tsx`
- Modify: `src/app/ReaderAppShell.test.tsx`
- Modify: `src/features/settings/SettingsPanel.tsx`

- [ ] **Step 1: Write the failing shell interaction tests**

Extend `ReaderAppShell.test.tsx` to cover:
- clicking `Settings` opens the existing settings panel on `/books/book-1`
- clicking `Library` on `/books/book-1` opens a drawer
- importing a file from the reader route triggers the import path and navigates to the new book

Example import assertion:

```tsx
await user.upload(screen.getByLabelText(/import epub/i), file);
expect(await screen.findByText(/reader route opened/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run the shell interaction tests**

Run: `npm test -- src/app/ReaderAppShell.test.tsx`

Expected: FAIL because the shell does not yet manage import/settings/drawer state.

- [ ] **Step 3: Implement the minimal shell-owned system actions**

In `ReaderAppShell.tsx`:
- add hidden file input
- call the existing `importBook()` flow
- refresh library data after import
- navigate to `/books/:newBookId` on success
- manage `isLibraryOpen`, `isSettingsOpen`, `isImporting`, and `importError`

Create:
- `AppHeader.tsx` for shell header rendering
- `LibraryDrawer.tsx` for the overlay wrapper

Keep `SettingsPanel` reusable from shell state without route-specific assumptions.

- [ ] **Step 4: Re-run the shell interaction tests**

Run: `npm test -- src/app/ReaderAppShell.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit the global navigation and import flow**

```bash
git add src/app/AppHeader.tsx src/app/LibraryDrawer.tsx src/app/readerAppShell.css src/app/ReaderAppShell.tsx src/app/ReaderAppShell.test.tsx src/features/settings/SettingsPanel.tsx
git commit -m "feat: add global reader navigation and import flow"
```

## Chunk 4: Library Drawer Book Switching and Current Book Summary

### Task 4: Reuse the library panel inside the drawer and close it on successful navigation

**Files:**
- Modify: `src/app/ReaderAppShell.tsx`
- Modify: `src/app/LibraryDrawer.tsx`
- Modify: `src/features/bookshelf/LibraryPanel.tsx`
- Modify: `src/app/ReaderAppShell.test.tsx`

- [ ] **Step 1: Write the failing drawer-navigation tests**

Add tests that:
- open the library drawer on a reader route
- click a book in the drawer
- assert navigation changes to the target book
- assert the drawer closes after the route change

Also cover deleting a book from the drawer and refreshing the visible list.

- [ ] **Step 2: Run the drawer-navigation tests**

Run: `npm test -- src/app/ReaderAppShell.test.tsx src/features/bookshelf/LibraryPanel.test.tsx`

Expected: FAIL because the drawer is not yet wired to the reusable library content and route-change close behavior.

- [ ] **Step 3: Implement the minimal drawer library integration**

Render `LibraryPanel` inside `LibraryDrawer` with shell-owned callbacks:
- `onOpenBook(bookId)` navigates and closes the drawer
- `onDeleteBook(bookId)` deletes, refreshes library items, and preserves the current route unless the current book was removed

Keep the drawer non-destructive: opening it must not unmount the reader until navigation actually changes.

- [ ] **Step 4: Re-run the drawer-navigation tests**

Run: `npm test -- src/app/ReaderAppShell.test.tsx src/features/bookshelf/LibraryPanel.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit the drawer library integration**

```bash
git add src/app/ReaderAppShell.tsx src/app/LibraryDrawer.tsx src/features/bookshelf/LibraryPanel.tsx src/app/ReaderAppShell.test.tsx src/features/bookshelf/LibraryPanel.test.tsx
git commit -m "feat: reuse library panel in reader drawer"
```

### Task 5: Show current book identity in the shell header and polish the mature-reader layout

**Files:**
- Modify: `src/app/AppHeader.tsx`
- Modify: `src/app/ReaderAppShell.tsx`
- Modify: `src/app/readerAppShell.css`
- Modify: `src/features/reader/reader.css`
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/ReaderAppShell.test.tsx`

- [ ] **Step 1: Write the failing current-book header tests**

Add tests that assert:
- `/` shows `Your library`
- `/books/:bookId` shows the current book title, author, and progress label in the shell header
- the reader toolbar still renders below the shell header and remains distinct

Example assertion:

```tsx
expect(screen.getByText("Minimal Valid EPUB")).toBeInTheDocument();
expect(screen.getByText("42% read")).toBeInTheDocument();
```

- [ ] **Step 2: Run the current-book header tests**

Run: `npm test -- src/app/App.test.tsx src/app/ReaderAppShell.test.tsx src/features/reader/ReaderPage.test.tsx`

Expected: FAIL because the shell header does not yet show route-aware library metadata.

- [ ] **Step 3: Implement the minimal header identity and layout polish**

In `ReaderAppShell.tsx`:
- derive `currentBookSummary` from shell-loaded library items and the active `bookId`
- pass that summary to `AppHeader`

In CSS:
- make the shell header feel like app chrome instead of page-local content
- ensure the drawer overlays the reader cleanly without shrinking the prose column
- keep the reader `TopBar` visually distinct as reading controls

- [ ] **Step 4: Re-run the current-book header tests**

Run: `npm test -- src/app/App.test.tsx src/app/ReaderAppShell.test.tsx src/features/reader/ReaderPage.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit the mature-reader shell polish**

```bash
git add src/app/AppHeader.tsx src/app/ReaderAppShell.tsx src/app/readerAppShell.css src/features/reader/reader.css src/app/App.test.tsx src/app/ReaderAppShell.test.tsx src/features/reader/ReaderPage.test.tsx
git commit -m "feat: show current book info in reader shell"
```

## Chunk 5: Browser Coverage and Release

### Task 6: Add end-to-end coverage for reader-route library access and deploy

**Files:**
- Create: `tests/e2e/navigation-shell.spec.ts`
- Modify: `tests/e2e/reader-modes.spec.ts`

- [ ] **Step 1: Write the failing Playwright scenarios**

Add browser tests that:
- start on a reader route and open the library drawer
- switch to another imported book from the drawer
- import a new EPUB while reading and verify immediate navigation to that book
- open settings from the reader route

- [ ] **Step 2: Run the new browser tests**

Run: `npm run e2e -- tests/e2e/navigation-shell.spec.ts`

Expected: FAIL because the global navigation shell does not yet expose these workflows.

- [ ] **Step 3: Implement any final browser-driven fixes**

Make only the minimum changes required to pass the browser scenarios. Prefer shell-level fixes over special cases inside `ReaderPage`.

- [ ] **Step 4: Re-run the browser tests**

Run: `npm run e2e -- tests/e2e/navigation-shell.spec.ts`

Expected: PASS

- [ ] **Step 5: Run full verification**

Run: `npm test`

Expected: PASS

Run: `npm run e2e -- tests/e2e/reader-modes.spec.ts tests/e2e/navigation-shell.spec.ts`

Expected: PASS

Run: `npm run build`

Expected: PASS, with only the existing chunk-size warning if unchanged

- [ ] **Step 6: Commit and publish**

```bash
git add tests/e2e/navigation-shell.spec.ts tests/e2e/reader-modes.spec.ts
git commit -m "test: cover reader shell navigation flows"
rsync -a --delete dist/ /app/epubReader/
```
