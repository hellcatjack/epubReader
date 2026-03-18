# EPUB Reader Home and TTS UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the bookshelf landing page into a bookshelf-first home screen with a grouped settings panel, and redesign the reader-side TTS queue so playback controls, voice selection, and compact TTS settings feel cohesive.

**Architecture:** Reuse the existing React route structure, shared settings repository, and browser-native TTS integration. Split presentation changes into three focused slices: a reusable grouped settings panel, a styled bookshelf home shell, and a tighter reader-side TTS control card that writes back to the same persisted settings store.

**Tech Stack:** React 19, React Router 7, TypeScript, Vite, browser `speechSynthesis`, Vitest, Testing Library, Playwright.

---

## File Structure

### Existing Files to Modify

- `src/features/bookshelf/BookshelfPage.tsx`
  - Replace the current bare bookshelf markup with the new bookshelf-first landing structure.
- `src/features/bookshelf/BookCard.tsx`
  - Add semantic structure and class hooks for styled bookshelf cards.
- `src/features/settings/SettingsDialog.tsx`
  - Refactor into grouped common/advanced settings UI that can render inside a popover-style shell.
- `src/features/settings/settingsDialog.test.tsx`
  - Update tests for grouped settings, hidden advanced controls, and the new bookshelf trigger flow.
- `src/features/reader/panels/TtsStatusPanel.tsx`
  - Redesign the TTS queue card to include voice, rate, and volume controls in a compact layout.
- `src/features/reader/RightPanel.tsx`
  - Keep `TTS queue` above `Appearance` and pass through the new TTS control props.
- `src/features/reader/ReaderPage.tsx`
  - Resolve browser voices for the TTS card, wire `voice/rate/volume` writes to the shared settings store, and keep live reader state in sync.
- `src/features/bookshelf/BookshelfPage.test.tsx`
  - Add layout-behavior tests for the home page settings trigger and continue-reading hero.
- `src/features/reader/ReaderPage.test.tsx`
  - Cover reader-side TTS control persistence and ordering.

### New Files to Create

- `src/features/bookshelf/bookshelf.css`
  - Styles for the landing page hero, actions, continue-reading card, and bookshelf grid.
- `src/features/settings/settings.css`
  - Styles for the grouped settings panel, common/advanced sections, and compact form layout.
- `src/features/settings/SettingsPanel.tsx`
  - Lightweight presentation shell for opening/closing the settings UI from the bookshelf page.
- `src/features/reader/panels/TtsStatusPanel.test.tsx`
  - Focused component tests for compact TTS controls, voice field placement, and rate/volume width behavior.

### Existing Files Likely Unchanged

- `src/features/settings/settingsRepository.ts`
  - Reuse the existing persistence model; do not invent a second settings store.
- `src/features/tts/browserTtsClient.ts`
  - Reuse current voice discovery and utterance behavior.
- `src/styles/global.css`
  - Leave global reset/theme behavior alone unless a minimal supporting tweak is unavoidable.

## Chunk 1: Grouped Settings Panel

### Task 1: Add failing tests for grouped settings UI

**Files:**
- Modify: `src/features/settings/settingsDialog.test.tsx`
- Create: `src/features/settings/SettingsPanel.tsx`
- Create: `src/features/settings/settings.css`

- [ ] **Step 1: Write the failing tests for grouped settings presentation**

Add tests that assert:

- `SettingsDialog` renders common settings immediately
- advanced typography controls are initially hidden behind an expand action
- a settings shell can be toggled open and closed without losing the dialog

Suggested test cases to add in `src/features/settings/settingsDialog.test.tsx`:

```tsx
it("shows common settings first and reveals advanced typography on demand", async () => {
  installSpeechSynthesis([buildVoice("Microsoft Ava Online (Natural)", "en-US", true)]);
  render(<SettingsDialog />);

  expect(await screen.findByLabelText(/target language/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/paragraph spacing/i)).not.toBeInTheDocument();

  await userEvent.setup().click(screen.getByRole("button", { name: /advanced typography/i }));

  expect(await screen.findByLabelText(/paragraph spacing/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the settings tests to verify the new cases fail**

Run:

```bash
npx vitest run src/features/settings/settingsDialog.test.tsx
```

Expected:
- FAIL because the current `SettingsDialog` shows all controls inline and has no grouped advanced section.

- [ ] **Step 3: Implement the minimal grouped settings shell**

Create `src/features/settings/SettingsPanel.tsx` as a small open/close wrapper and update `src/features/settings/SettingsDialog.tsx` to:

- support grouped sections
- render common settings by default
- reveal typography controls only after expanding the advanced section
- preserve the existing save behavior

Create `src/features/settings/settings.css` with compact grouped panel styles.

Suggested structure:

```tsx
export function SettingsPanel({ open, onClose, triggerLabel, children }: Props) {
  if (!open) return null;
  return (
    <div className="settings-panel-backdrop">
      <section className="settings-panel" aria-label="Reader settings panel">
        <header className="settings-panel-header">
          <h2>Settings</h2>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        {children}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Re-run the settings tests**

Run:

```bash
npx vitest run src/features/settings/settingsDialog.test.tsx
```

Expected:
- PASS with the new grouped panel behavior.

- [ ] **Step 5: Commit the grouped settings panel**

Run:

```bash
git add src/features/settings/SettingsDialog.tsx src/features/settings/SettingsPanel.tsx src/features/settings/settings.css src/features/settings/settingsDialog.test.tsx
git commit -m "feat: group bookshelf settings into a compact panel"
```

## Chunk 2: Bookshelf Landing Page Refresh

### Task 2: Redesign the bookshelf home page around continue-reading and import

**Files:**
- Modify: `src/features/bookshelf/BookshelfPage.tsx`
- Modify: `src/features/bookshelf/BookCard.tsx`
- Modify: `src/features/bookshelf/BookshelfPage.test.tsx`
- Create: `src/features/bookshelf/bookshelf.css`

- [ ] **Step 1: Write failing tests for the new home-page interaction**

Add tests in `src/features/bookshelf/BookshelfPage.test.tsx` that assert:

- the home page shows a `Settings` trigger instead of rendering the full settings form inline
- clicking `Settings` opens the panel
- the continue-reading surface remains prominent and actionable

Suggested test case:

```tsx
it("opens the bookshelf settings panel from a header action", async () => {
  render(
    <MemoryRouter>
      <BookshelfPage books={[]} />
    </MemoryRouter>,
  );

  expect(screen.queryByLabelText(/reader settings/i)).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: /settings/i }));
  expect(await screen.findByLabelText(/reader settings panel/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the bookshelf tests and confirm failure**

Run:

```bash
npx vitest run src/features/bookshelf/BookshelfPage.test.tsx
```

Expected:
- FAIL because the current bookshelf page renders `SettingsDialog` inline and has no modal/panel trigger.

- [ ] **Step 3: Implement the bookshelf layout refresh**

Update `src/features/bookshelf/BookshelfPage.tsx` to render:

- a hero header with title, short copy, import button, and `Settings` button
- a hidden file input wired to the visible import CTA
- a large `Continue reading` card
- a bookshelf grid section below

Update `src/features/bookshelf/BookCard.tsx` with structure/classes for:

- cover/title area
- metadata row
- action row

Add `src/features/bookshelf/bookshelf.css` and import it from `BookshelfPage.tsx`.

Suggested shell:

```tsx
<main className="bookshelf-page">
  <header className="bookshelf-hero">
    <div className="bookshelf-hero-copy">...</div>
    <div className="bookshelf-hero-actions">...</div>
  </header>
  <SettingsPanel open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)}>
    <SettingsDialog />
  </SettingsPanel>
  {continueReadingBook ? <section className="continue-reading-card">...</section> : null}
  <section className="bookshelf-grid">...</section>
</main>
```

- [ ] **Step 4: Re-run the bookshelf tests**

Run:

```bash
npx vitest run src/features/bookshelf/BookshelfPage.test.tsx
```

Expected:
- PASS with import, continue-reading, and settings-panel behavior intact.

- [ ] **Step 5: Commit the bookshelf refresh**

Run:

```bash
git add src/features/bookshelf/BookshelfPage.tsx src/features/bookshelf/BookCard.tsx src/features/bookshelf/bookshelf.css src/features/bookshelf/BookshelfPage.test.tsx
git commit -m "feat: redesign bookshelf landing page"
```

## Chunk 3: Reader TTS Queue Redesign

### Task 3: Move voice selection into the TTS queue and tighten the right rail layout

**Files:**
- Modify: `src/features/reader/panels/TtsStatusPanel.tsx`
- Modify: `src/features/reader/RightPanel.tsx`
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/reader.css`
- Modify: `src/features/reader/ReaderPage.test.tsx`
- Create: `src/features/reader/panels/TtsStatusPanel.test.tsx`

- [ ] **Step 1: Write failing tests for the TTS queue layout and persistence**

Add focused component tests in `src/features/reader/panels/TtsStatusPanel.test.tsx` asserting:

- `Voice`, `Rate`, and `Volume` render inside the `TTS queue` card
- the controls use compact layout hooks/classes
- quick rate actions still exist

Add an integration-style test in `src/features/reader/ReaderPage.test.tsx` asserting:

- changing voice in the TTS queue writes back to settings
- changing rate/volume in the queue updates reader state without moving the panel below `Appearance`

Suggested component test:

```tsx
it("renders voice, rate, and volume controls inside the tts queue", () => {
  render(
    <TtsStatusPanel
      status="idle"
      voices={[{ id: "ava", displayName: "Microsoft Ava", locale: "en-US", gender: "female", isDefault: true }]}
      voiceId="ava"
    />,
  );

  expect(screen.getByLabelText(/tts voice/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/tts rate/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/tts volume/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the reader/TTS tests and confirm failure**

Run:

```bash
npx vitest run src/features/reader/panels/TtsStatusPanel.test.tsx src/features/reader/ReaderPage.test.tsx
```

Expected:
- FAIL because the current `TTS queue` only renders start/pause/resume/stop and preset rate buttons.

- [ ] **Step 3: Implement the compact TTS queue UI**

Update `src/features/reader/panels/TtsStatusPanel.tsx` to accept:

- `voices`
- `voiceId`
- `volume`
- `onVoiceChange`
- `onVolumeChange`

and render:

- status/current text
- playback buttons row
- compact controls row with `Voice`, `Rate`, and `Volume`
- existing rate presets as a secondary compact strip if still needed

Update `src/features/reader/RightPanel.tsx` and `src/features/reader/ReaderPage.tsx` to:

- resolve browser voices once per reader session
- pass selected voice, rate, and volume into the TTS card
- persist changes through the existing settings update path

Update `src/features/reader/reader.css` to:

- keep `TTS queue` above `Appearance`
- define compact widths such as:
  - `.reader-tts-voice { max-width: 14rem; }`
  - `.reader-tts-number { width: 5.5rem; }`
- prevent control rows from stretching the right rail

- [ ] **Step 4: Re-run the reader/TTS tests**

Run:

```bash
npx vitest run src/features/reader/panels/TtsStatusPanel.test.tsx src/features/reader/ReaderPage.test.tsx
```

Expected:
- PASS with the new TTS control layout and persistence behavior.

- [ ] **Step 5: Commit the TTS queue redesign**

Run:

```bash
git add src/features/reader/panels/TtsStatusPanel.tsx src/features/reader/panels/TtsStatusPanel.test.tsx src/features/reader/RightPanel.tsx src/features/reader/ReaderPage.tsx src/features/reader/reader.css src/features/reader/ReaderPage.test.tsx
git commit -m "feat: redesign reader tts queue controls"
```

## Chunk 4: Full Verification and Release Readiness

### Task 4: Verify the home page and reader UI end to end

**Files:**
- Modify: `tests/e2e/bookshelf.spec.ts`
- Modify: `tests/e2e/local-tts.spec.ts`
- Modify: `tests/e2e/reader-modes.spec.ts` (only if a layout assertion needs to move)

- [ ] **Step 1: Add browser tests for the new bookshelf settings interaction**

Update `tests/e2e/bookshelf.spec.ts` to cover:

- opening the bookshelf settings panel from the header
- changing a common setting
- closing the panel
- importing/opening a book still works afterward

Suggested browser flow:

```ts
await page.goto("/");
await page.getByRole("button", { name: /settings/i }).click();
await expect(page.getByLabel("Reader settings panel")).toBeVisible();
await page.getByRole("button", { name: /advanced typography/i }).click();
await page.getByRole("button", { name: /close settings/i }).click();
```

- [ ] **Step 2: Add browser tests for the new TTS queue controls**

Update `tests/e2e/local-tts.spec.ts` to assert:

- `TTS queue` appears above `Appearance`
- `TTS voice` is present in the TTS card
- rate changes from the card are reflected in the current reader session

- [ ] **Step 3: Run targeted browser tests**

Run:

```bash
npx playwright test tests/e2e/bookshelf.spec.ts tests/e2e/local-tts.spec.ts tests/e2e/reader-modes.spec.ts
```

Expected:
- PASS for bookshelf interaction, reader layout, and TTS control coverage.

- [ ] **Step 4: Run the final full verification**

Run:

```bash
npx vitest run
npx playwright test
npm run build
```

Expected:
- Vitest passes
- Playwright passes
- production build succeeds

- [ ] **Step 5: Commit the verification-related updates**

Run:

```bash
git add tests/e2e/bookshelf.spec.ts tests/e2e/local-tts.spec.ts tests/e2e/reader-modes.spec.ts
git commit -m "test: cover bookshelf and tts ui refresh"
```

## Notes for the Implementer

- Keep the settings state unified; do not create a second settings reducer/store for the bookshelf overlay.
- Avoid adding route-level complexity. This is a UI refactor, not a navigation refactor.
- Prefer a hidden native file input plus button trigger over replacing file upload behavior entirely.
- Do not move `Appearance` above `TTS queue`; the user explicitly wants `TTS queue` first.
- Preserve all current non-UI behavior unless a test proves a regression or a UI change requires a deliberate adjustment.

Plan complete and saved to `docs/superpowers/plans/2026-03-18-epub-reader-home-and-tts-ui.md`. Ready to execute?
