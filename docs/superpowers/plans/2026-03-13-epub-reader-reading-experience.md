# EPUB Reader Reading Experience Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the reader so users can page through books, select text reliably, and tune typography with live persisted controls.

**Architecture:** Extend the current `epubRuntime` into a richer reader-session boundary that can navigate, switch flow modes, and apply reader preferences. Keep persistence in Dexie, move appearance controls into the reading workflow, and validate with both focused tests and browser e2e.

**Tech Stack:** React, TypeScript, Vite, Dexie, epub.js, Vitest, React Testing Library, Playwright

---

## Planned File Structure

- Reader runtime and view
  - Modify: `src/features/reader/epubRuntime.ts`
  - Modify: `src/features/reader/EpubViewport.tsx`
  - Modify: `src/features/reader/ReaderPage.tsx`
  - Modify: `src/features/reader/TopBar.tsx`
  - Modify: `src/features/reader/LeftRail.tsx`
  - Modify: `src/features/reader/RightPanel.tsx`
  - Modify: `src/features/reader/panels/AiResultPanel.tsx`
  - Create: `src/features/reader/panels/AppearancePanel.tsx`
  - Create: `src/features/reader/readerPreferences.ts`
  - Modify: `src/features/reader/reader.css`
- Settings and persistence
  - Modify: `src/lib/types/settings.ts`
  - Modify: `src/features/settings/settingsRepository.ts`
  - Modify: `src/features/settings/SettingsDialog.tsx`
- Annotation compatibility
  - Modify: `src/features/annotations/annotationService.ts`
- Tests
  - Modify: `src/features/annotations/annotationService.test.ts`
  - Modify: `src/features/settings/settingsDialog.test.tsx`
  - Create: `src/features/reader/readerPreferences.test.ts`
  - Modify: `src/features/reader/ReaderPage.test.tsx`
  - Modify: `src/features/reader/EpubViewport.test.tsx`
  - Modify: `src/features/reader/selectionActions.test.tsx`
  - Modify: `tests/e2e/bookshelf.spec.ts`
  - Modify: `tests/e2e/ai-actions.spec.ts`
  - Modify: `tests/e2e/tts-pwa-security.spec.ts`
  - Create: `tests/e2e/reader-modes.spec.ts`

## Chunk 1: Reader Session Controls

### Task 1: Extend persisted reader settings

**Files:**
- Modify: `src/lib/types/settings.ts`
- Modify: `src/features/settings/settingsRepository.ts`
- Test: `src/features/settings/settingsDialog.test.tsx`

- [ ] **Step 1: Write the failing settings test**

```tsx
it("persists reading mode and advanced typography settings", async () => {
  await saveSettings({
    apiKey: "",
    targetLanguage: "en",
    theme: "sepia",
    ttsVoice: "disabled",
    fontScale: 1.1,
    readingMode: "paginated",
    lineHeight: 1.8,
    letterSpacing: 0.03,
    paragraphSpacing: 1,
    paragraphIndent: 2,
    contentPadding: 40,
    maxLineWidth: 780,
    columnCount: 2,
    fontFamily: "book",
  });

  expect(await getResolvedSettings()).toMatchObject({
    readingMode: "paginated",
    lineHeight: 1.8,
    columnCount: 2,
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/settings/settingsDialog.test.tsx`
Expected: FAIL because the new fields do not exist in the settings schema.

- [ ] **Step 3: Implement the settings shape**

```ts
export type ReadingMode = "scrolled" | "paginated";
export type ReaderFontFamily = "serif" | "sans" | "book";

export type SettingsRecord = {
  id: "settings";
  apiKey: string;
  targetLanguage: string;
  theme: ThemeName;
  ttsVoice: string;
  fontScale: number;
  readingMode: ReadingMode;
  lineHeight: number;
  letterSpacing: number;
  paragraphSpacing: number;
  paragraphIndent: number;
  contentPadding: number;
  maxLineWidth: number;
  columnCount: 1 | 2;
  fontFamily: ReaderFontFamily;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/settings/settingsDialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/settings.ts src/features/settings/settingsRepository.ts src/features/settings/settingsDialog.test.tsx
git commit -m "feat: extend persisted reader settings"
```

### Task 2: Add runtime page-turn and flow controls

**Files:**
- Modify: `src/features/reader/epubRuntime.ts`
- Modify: `src/features/reader/EpubViewport.tsx`
- Modify: `src/features/reader/EpubViewport.test.tsx`
- Create: `src/features/reader/readerPreferences.ts`
- Create: `src/features/reader/readerPreferences.test.ts`

- [ ] **Step 1: Write the failing runtime tests**

```tsx
it("can switch flow mode and page forward/backward", async () => {
  const commands: string[] = [];
  const runtime = {
    render: vi.fn(async () => ({
      destroy() {},
      next: async () => commands.push("next"),
      prev: async () => commands.push("prev"),
      setFlow: async (flow) => commands.push(`flow:${flow}`),
      goTo: async (target) => commands.push(`goto:${target}`),
      applyPreferences: async () => commands.push("apply"),
    })),
  };

  render(<EpubViewport bookId="book-1" runtime={runtime} />);
  // trigger next / prev / flow from props or exposed handlers
  expect(commands).toContain("flow:scrolled");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/reader/EpubViewport.test.tsx src/features/reader/readerPreferences.test.ts`
Expected: FAIL because the runtime handle only exposes `destroy()`.

- [ ] **Step 3: Implement the reader-session commands**

```ts
export type RuntimeRenderHandle = {
  destroy(): void;
  next(): Promise<void>;
  prev(): Promise<void>;
  setFlow(flow: ReadingMode): Promise<void>;
  goTo(target: string): Promise<void>;
  applyPreferences(preferences: ReaderPreferences): Promise<void>;
};
```

- [ ] **Step 4: Run the focused tests**

Run: `npx vitest run src/features/reader/EpubViewport.test.tsx src/features/reader/readerPreferences.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/epubRuntime.ts src/features/reader/EpubViewport.tsx src/features/reader/EpubViewport.test.tsx src/features/reader/readerPreferences.ts src/features/reader/readerPreferences.test.ts
git commit -m "feat: add reader session controls"
```

### Task 3: Wire top-bar mode switch and page navigation

**Files:**
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/TopBar.tsx`
- Modify: `src/features/reader/reader.css`
- Modify: `src/features/reader/ReaderPage.test.tsx`
- Modify: `src/features/reader/selectionActions.test.tsx`

- [ ] **Step 1: Write the failing interaction test**

```tsx
it("switches between scrolled and paginated mode and pages forward", async () => {
  const next = vi.fn(async () => undefined);
  const setFlow = vi.fn(async () => undefined);

  render(<ReaderPage runtime={runtimeWith({ next, setFlow })} />);

  await user.click(screen.getByRole("button", { name: /paginated mode/i }));
  await user.keyboard("{ArrowRight}");

  expect(setFlow).toHaveBeenCalledWith("paginated");
  expect(next).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/reader/ReaderPage.test.tsx src/features/reader/selectionActions.test.tsx`
Expected: FAIL because there is no mode switch or page-turn wiring.

- [ ] **Step 3: Implement the controls**

```tsx
<TopBar
  readingMode={settings.readingMode}
  onChangeReadingMode={handleChangeReadingMode}
  onNextPage={handleNextPage}
  onPrevPage={handlePrevPage}
/>
```

- [ ] **Step 4: Run the focused tests**

Run: `npx vitest run src/features/reader/ReaderPage.test.tsx src/features/reader/selectionActions.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/TopBar.tsx src/features/reader/reader.css src/features/reader/ReaderPage.test.tsx src/features/reader/selectionActions.test.tsx
git commit -m "feat: add reader mode switching and page controls"
```

## Chunk 2: Selection Stability and Appearance Controls

### Task 4: Preserve text selection and suppress accidental page turns

**Files:**
- Modify: `src/features/reader/epubRuntime.ts`
- Modify: `src/features/reader/EpubViewport.tsx`
- Modify: `src/features/reader/EpubViewport.test.tsx`
- Modify: `tests/e2e/ai-actions.spec.ts`

- [ ] **Step 1: Write the failing selection test**

```tsx
it("does not clear the native selection after capture", async () => {
  // render runtime, simulate selected callback, ensure removeAllRanges is not called
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/reader/EpubViewport.test.tsx`
Expected: FAIL because `contents.window.getSelection()?.removeAllRanges()` still runs.

- [ ] **Step 3: Implement minimal selection-safe behavior**

```ts
const handleSelection = async (cfiRange, contents) => {
  const range = await book.getRange(cfiRange);
  const text = range?.toString().trim() ?? "";
  onSelectionChange?.({ cfiRange, text });
  // do not clear native ranges here
};
```

- [ ] **Step 4: Run the focused tests**

Run: `npx vitest run src/features/reader/EpubViewport.test.tsx tests/e2e/ai-actions.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/epubRuntime.ts src/features/reader/EpubViewport.tsx src/features/reader/EpubViewport.test.tsx tests/e2e/ai-actions.spec.ts
git commit -m "fix: preserve reader text selection"
```

### Task 5: Build the in-reader appearance panel

**Files:**
- Create: `src/features/reader/panels/AppearancePanel.tsx`
- Modify: `src/features/reader/RightPanel.tsx`
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/settings/SettingsDialog.tsx`
- Modify: `src/features/settings/settingsDialog.test.tsx`
- Modify: `src/features/reader/selectionActions.test.tsx`

- [ ] **Step 1: Write the failing appearance-panel test**

```tsx
it("updates reader appearance live from the reading screen", async () => {
  render(<ReaderPage runtime={runtimeWithApplyPreferencesSpy} />);

  await user.selectOptions(screen.getByLabelText(/reading mode/i), "scrolled");
  await user.clear(screen.getByLabelText(/line height/i));
  await user.type(screen.getByLabelText(/line height/i), "1.9");

  expect(applyPreferences).toHaveBeenCalledWith(expect.objectContaining({ lineHeight: 1.9 }));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/reader/selectionActions.test.tsx src/features/settings/settingsDialog.test.tsx`
Expected: FAIL because the reader screen has no appearance controls.

- [ ] **Step 3: Implement the appearance UI**

```tsx
<AppearancePanel
  settings={settings}
  onChange={handleUpdateSettings}
/>
```

- [ ] **Step 4: Run the focused tests**

Run: `npx vitest run src/features/reader/selectionActions.test.tsx src/features/settings/settingsDialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/panels/AppearancePanel.tsx src/features/reader/RightPanel.tsx src/features/reader/ReaderPage.tsx src/features/settings/SettingsDialog.tsx src/features/settings/settingsDialog.test.tsx src/features/reader/selectionActions.test.tsx
git commit -m "feat: add in-reader appearance controls"
```

## Chunk 3: First-Body Opening and Browser Verification

### Task 6: Prefer the first body chapter when no progress exists

**Files:**
- Modify: `src/features/reader/epubRuntime.ts`
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `tests/e2e/bookshelf.spec.ts`
- Create: `tests/e2e/reader-modes.spec.ts`

- [ ] **Step 1: Write the failing browser test**

```ts
test("opens a novel into body content instead of front matter on first import", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("input[type=file]", fixturePath);
  await expect(page.getByText(/chapter one/i)).toBeVisible();
  await expect(page.locator(".epub-root iframe")).toContainText(/morgan/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/e2e/bookshelf.spec.ts tests/e2e/reader-modes.spec.ts`
Expected: FAIL because the reader currently starts at the EPUB default opening section.

- [ ] **Step 3: Implement the opening heuristic**

```ts
function chooseInitialTarget(nav: NavItem[], fallback?: string) {
  if (fallback) return fallback;
  return firstNonFrontMatterHref(nav) ?? undefined;
}
```

- [ ] **Step 4: Run browser verification**

Run: `npx playwright test tests/e2e/bookshelf.spec.ts tests/e2e/reader-modes.spec.ts tests/e2e/ai-actions.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/epubRuntime.ts src/features/reader/ReaderPage.tsx tests/e2e/bookshelf.spec.ts tests/e2e/reader-modes.spec.ts
git commit -m "feat: open books into body chapters and verify reader modes"
```

## Execution Notes

- Skip subagent review loops in this repository because the user explicitly requested no subagents in this session
- Use real-book validation against `The_Barren_Grounds_(The_Misewa_Saga_01)...epub` after each chunk
- Keep all new reader settings backward-compatible with existing stored settings records

Plan complete and saved to `docs/superpowers/plans/2026-03-13-epub-reader-reading-experience.md`. Ready to execute.
