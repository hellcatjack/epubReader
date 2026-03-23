# Reader TopBar Shell Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move reader-route shell actions into the existing `TopBar`, recover book viewport height, and make the library drawer robust without horizontal scrolling.

**Architecture:** Keep `ReaderAppShell` as the owner of library/import/settings state, but stop rendering `AppHeader` on `/books/:bookId`. Instead, expose shell actions through outlet context and let `ReaderPage` render them inside `TopBar`. Tighten drawer-specific library styles so the reader-side library overlay always fits within the viewport.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, Playwright, Vite

---

## File Map

- Modify: `src/app/ReaderAppShell.tsx` — render shell header only on `/`, provide reader-route shell actions through outlet context
- Modify: `src/app/readerAppShellContext.ts` — define shell action/context shape consumed by `ReaderPage`
- Modify: `src/app/AppHeader.tsx` — keep home-route-only shell header behavior
- Modify: `src/app/ReaderAppShell.test.tsx` — cover home-vs-reader header split and drawer overflow behavior
- Modify: `src/features/reader/ReaderPage.tsx` — consume shell context and pass system actions into `TopBar`
- Modify: `src/features/reader/TopBar.tsx` — render a `systemActions` slot alongside reading controls
- Modify: `src/features/reader/ReaderPage.test.tsx` — assert reader `TopBar` renders shell actions on reader routes
- Modify: `src/features/reader/reader.css` — remove shell-header offset dependency on reader route and style merged action layout
- Modify: `src/features/bookshelf/LibraryPanel.tsx` — add drawer-specific compact structure hooks only if needed
- Modify: `src/features/bookshelf/bookshelf.css` — enforce drawer-mode width containment and wrapping
- Modify: `tests/e2e/navigation-shell.spec.ts` — verify shell actions moved into reader `TopBar` and no horizontal overflow in narrow drawer mode

## Task 1: Move Reader-Route Shell Actions Into TopBar

**Files:**
- Modify: `src/app/ReaderAppShell.tsx`
- Modify: `src/app/readerAppShellContext.ts`
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/TopBar.tsx`
- Modify: `src/app/ReaderAppShell.test.tsx`
- Modify: `src/features/reader/ReaderPage.test.tsx`

- [ ] **Step 1: Write the failing shell/reader integration tests**

Add tests that assert:
- `/books/:bookId` does not render the shell header
- reader `TopBar` renders `Library`, `Import EPUB`, and `Settings`
- `/` still renders the shell header

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/app/ReaderAppShell.test.tsx src/features/reader/ReaderPage.test.tsx`

Expected: FAIL because reader routes still render the shell header and `TopBar` does not yet know about shell actions.

- [ ] **Step 3: Implement the minimal route-aware shell/context integration**

In `ReaderAppShell.tsx`:
- render `AppHeader` only when not on `/books/:bookId`
- expose shell action handlers and state through outlet context

In `ReaderPage.tsx` and `TopBar.tsx`:
- read shell context
- render system actions inside `TopBar`

- [ ] **Step 4: Re-run the targeted tests**

Run: `npm test -- src/app/ReaderAppShell.test.tsx src/features/reader/ReaderPage.test.tsx`

Expected: PASS

## Task 2: Remove Drawer Horizontal Overflow and Compact Reader-Only Library UI

**Files:**
- Modify: `src/features/bookshelf/LibraryPanel.tsx`
- Modify: `src/features/bookshelf/bookshelf.css`
- Modify: `src/app/ReaderAppShell.test.tsx`

- [ ] **Step 1: Write the failing drawer overflow test**

Add a test that renders the drawer in reader mode and asserts drawer-mode content is wrapped/contained without horizontal overflow signals.

- [ ] **Step 2: Run the drawer tests to verify they fail**

Run: `npm test -- src/app/ReaderAppShell.test.tsx src/features/bookshelf/LibraryPanel.test.tsx`

Expected: FAIL because drawer mode is still using page-oriented spacing and containment rules.

- [ ] **Step 3: Implement minimal drawer-only containment fixes**

Update drawer-mode library styles to:
- force width containment
- hide horizontal overflow
- wrap long text and actions
- stack continue-reading content vertically in drawer mode

- [ ] **Step 4: Re-run the drawer tests**

Run: `npm test -- src/app/ReaderAppShell.test.tsx src/features/bookshelf/LibraryPanel.test.tsx`

Expected: PASS

## Task 3: Restore Reader Viewport Height and Add Browser Regression Coverage

**Files:**
- Modify: `src/features/reader/reader.css`
- Modify: `tests/e2e/navigation-shell.spec.ts`

- [ ] **Step 1: Write the failing browser regression scenarios**

Add Playwright checks that:
- on the reader route, shell actions appear in `TopBar`
- opening the library drawer on a narrow viewport does not create horizontal page overflow
- import/settings still work from the merged `TopBar`

- [ ] **Step 2: Run the browser regression tests**

Run: `npm run e2e -- tests/e2e/navigation-shell.spec.ts`

Expected: FAIL because the current reader route still uses the shell header and drawer styling is not hardened for narrow widths.

- [ ] **Step 3: Implement the minimal layout fix**

Update reader CSS so right-side tools and content no longer reserve vertical space for the removed reader-route shell header.

- [ ] **Step 4: Re-run the browser regression tests**

Run: `npm run e2e -- tests/e2e/navigation-shell.spec.ts`

Expected: PASS

## Task 4: Full Verification and Publish

**Files:**
- No additional production files

- [ ] **Step 1: Run full unit/integration verification**

Run: `npm test`

Expected: PASS

- [ ] **Step 2: Run browser verification**

Run: `npm run e2e -- tests/e2e/navigation-shell.spec.ts tests/e2e/reader-modes.spec.ts`

Expected: PASS

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS, with only the existing chunk-size warning if unchanged

- [ ] **Step 4: Publish**

Run: `rsync -a --delete dist/ /app/epubReader/`

Expected: deployed assets updated in `/app/epubReader`
