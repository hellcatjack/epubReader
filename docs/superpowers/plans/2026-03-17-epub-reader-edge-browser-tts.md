# EPUB Reader Edge Browser TTS Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current localhost TTS flow with a browser-native `speechSynthesis` path optimized for desktop Edge, while preserving selection read aloud and continuous reading controls.

**Architecture:** Introduce a dedicated `browserTtsClient` wrapper around `speechSynthesis` and route all reader TTS interactions through it. Remove `ttsHelperUrl` and other localhost-TTS dependencies from settings and reader flow, then rework tests to mock browser speech APIs instead of HTTP endpoints.

**Tech Stack:** React, TypeScript, Vitest, Playwright, Web Speech API (`speechSynthesis`, `SpeechSynthesisUtterance`)

---

## Planned File Structure

- Browser TTS client
  - Create: `src/features/tts/browserTtsClient.ts`
  - Create: `src/features/tts/browserTtsClient.test.ts`
  - Delete: `src/features/tts/localTtsClient.ts`
  - Delete: `src/features/tts/localTtsClient.test.ts`
- Queue and chunking
  - Modify: `src/features/tts/chunkText.ts`
  - Modify: `src/features/tts/chunkText.test.ts`
  - Modify: `src/features/tts/ttsQueue.ts`
  - Modify: `src/features/tts/ttsQueue.test.ts`
- Reader integration
  - Modify: `src/features/reader/ReaderPage.tsx`
  - Modify: `src/features/reader/ReaderPage.test.tsx`
  - Modify: `src/features/reader/panels/TtsStatusPanel.tsx`
  - Modify: `src/features/reader/panels/TtsStatusPanel.test.tsx`
  - Modify: `src/features/reader/selectionActions.test.tsx`
- Settings and persisted types
  - Modify: `src/lib/types/settings.ts`
  - Modify: `src/features/settings/settingsRepository.ts`
  - Modify: `src/features/settings/SettingsDialog.tsx`
  - Modify: `src/features/settings/settingsDialog.test.tsx`
  - Modify: `src/features/ai/aiService.ts`
- Browser and integration tests
  - Modify: `tests/e2e/local-tts.spec.ts`
  - Modify: `tests/e2e/tts-pwa-security.spec.ts`
  - Modify: `tests/e2e/ai-actions.spec.ts`
- Cleanup of repo-hosted TTS runtime artifacts
  - Delete: `scripts/setup-qwen3-tts-venv.sh`
  - Delete: `scripts/run-qwen3-tts-service.sh`
  - Delete: `tts/kokoro_tts_service/README.md`
  - Delete: `tts/kokoro_tts_service/__init__.py`
  - Delete: `tts/kokoro_tts_service/__main__.py`
  - Delete: `tts/kokoro_tts_service/app.py`
  - Delete: `tts/kokoro_tts_service/config.py`
  - Delete: `tts/kokoro_tts_service/kokoro_runtime.py`
  - Delete: `tts/kokoro_tts_service/runtime.py`
  - Delete: `tts/kokoro_tts_service/schemas.py`
  - Delete: `tts/kokoro_tts_service/voices.py`
  - Delete: `tts/kokoro_tts_service/tests/conftest.py`
  - Delete: `tts/kokoro_tts_service/tests/test_api.py`
  - Delete: `tts/kokoro_tts_service/tests/test_kokoro_runtime.py`

## Chunk 1: Browser TTS Client and Core Contracts

### Task 1: Add failing tests for a browser-native TTS client

**Files:**
- Create: `src/features/tts/browserTtsClient.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("loads voices from speechSynthesis and ranks English natural voices first", async () => {
  const client = createBrowserTtsClient({ speechSynthesis: fakeSpeechSynthesis });
  const voices = await client.getVoices();
  expect(voices.map((voice) => voice.id)).toEqual(["en-US-Natural-A", "en-US-Natural-B", "en-US-Fallback"]);
});

it("reports unsupported when speechSynthesis is unavailable", async () => {
  const client = createBrowserTtsClient({ speechSynthesis: undefined });
  await expect(client.getVoices()).rejects.toThrow("speechSynthesis unavailable");
});

it("starts a selection utterance with the chosen voice, rate, and volume", async () => {
  const client = createBrowserTtsClient({ speechSynthesis: fakeSpeechSynthesis });
  await client.speakSelection("Hello reader", {
    voiceId: "en-US-Natural-A",
    rate: 1,
    volume: 1,
  });
  expect(fakeSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run src/features/tts/browserTtsClient.test.ts`

Expected: FAIL because `browserTtsClient.ts` does not exist.

- [ ] **Step 3: Write the minimal browser TTS client**

Create `src/features/tts/browserTtsClient.ts` with:

- `createBrowserTtsClient()`
- `getVoices()`
- `speakSelection()`
- `pause()`
- `resume()`
- `stop()`

Add:

```ts
export type BrowserTtsVoice = {
  id: string;
  displayName: string;
  locale: string;
  gender: "male" | "female" | "unknown";
  isDefault: boolean;
};
```

Voice ranking should:

- prefer `lang` starting with `en`
- prefer voice names containing `Natural`
- preserve a stable order for equally-ranked fallback voices

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx vitest run src/features/tts/browserTtsClient.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/tts/browserTtsClient.ts src/features/tts/browserTtsClient.test.ts
git commit -m "feat: add browser speech synthesis client"
```

### Task 2: Convert the queue from localhost audio requests to utterance sequencing

**Files:**
- Modify: `src/features/tts/ttsQueue.ts`
- Modify: `src/features/tts/ttsQueue.test.ts`

- [ ] **Step 1: Write the failing queue tests**

```ts
it("advances to the next queued segment after the current utterance ends", async () => {
  const queue = createTtsQueue({ client: fakeBrowserTtsClient });
  await queue.start(["First paragraph.", "Second paragraph."], defaultOptions);
  expect(fakeBrowserTtsClient.speakSelection).toHaveBeenCalledWith("First paragraph.", defaultOptions);
  fakeBrowserTtsClient.finishCurrent();
  expect(fakeBrowserTtsClient.speakSelection).toHaveBeenCalledWith("Second paragraph.", defaultOptions);
});

it("stops the queue on utterance error", async () => {
  const queue = createTtsQueue({ client: fakeBrowserTtsClient });
  await queue.start(["First paragraph."], defaultOptions);
  fakeBrowserTtsClient.failCurrent(new Error("synthesis failed"));
  expect(queue.getState().status).toBe("error");
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run src/features/tts/ttsQueue.test.ts`

Expected: FAIL because the existing queue still expects localhost audio generation behavior.

- [ ] **Step 3: Write the minimal queue implementation**

Refactor `ttsQueue.ts` so that:

- queue items are plain text segments, not audio-fetch jobs
- each segment is spoken with `browserTtsClient.speakSelection()`
- `onend` starts the next queued segment
- `pause()`, `resume()`, and `stop()` proxy to the browser client
- queue state preserves:
  - `idle`
  - `loading`
  - `playing`
  - `paused`
  - `error`

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx vitest run src/features/tts/ttsQueue.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/tts/ttsQueue.ts src/features/tts/ttsQueue.test.ts
git commit -m "feat: adapt tts queue to browser utterances"
```

## Chunk 2: Reader and Settings Migration

### Task 3: Remove localhost TTS settings and add browser voice loading

**Files:**
- Modify: `src/lib/types/settings.ts`
- Modify: `src/features/settings/settingsRepository.ts`
- Modify: `src/features/settings/SettingsDialog.tsx`
- Modify: `src/features/settings/settingsDialog.test.tsx`

- [ ] **Step 1: Write the failing settings tests**

```ts
it("does not persist ttsHelperUrl in default settings", () => {
  const settings = buildDefaultSettings("192.168.1.31");
  expect("ttsHelperUrl" in settings).toBe(false);
});

it("loads browser voices and does not render the helper url field", async () => {
  render(<SettingsDialog isOpen onClose={() => {}} />);
  expect(screen.queryByLabelText(/tts helper url/i)).not.toBeInTheDocument();
  expect(await screen.findByLabelText(/tts voice/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run src/features/settings/settingsDialog.test.tsx`

Expected: FAIL because settings still include `ttsHelperUrl`.

- [ ] **Step 3: Write the minimal settings migration**

Update:

- `src/lib/types/settings.ts` to remove `ttsHelperUrl`
- `settingsRepository.ts` to ignore legacy `ttsHelperUrl` records
- `SettingsDialog.tsx` to fetch voices from `browserTtsClient`
- `SettingsDialog.tsx` to render only:
  - `TTS voice`
  - `TTS rate`
  - `TTS volume`

If the saved `ttsVoice` is not present in current voices, reset to the first recommended voice.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx vitest run src/features/settings/settingsDialog.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/settings.ts src/features/settings/settingsRepository.ts src/features/settings/SettingsDialog.tsx src/features/settings/settingsDialog.test.tsx
git commit -m "feat: migrate settings to browser tts"
```

### Task 4: Rewire reader playback and support messaging to browser TTS

**Files:**
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/ReaderPage.test.tsx`
- Modify: `src/features/reader/panels/TtsStatusPanel.tsx`
- Modify: `src/features/reader/panels/TtsStatusPanel.test.tsx`
- Modify: `src/features/ai/aiService.ts`
- Modify: `src/features/reader/selectionActions.test.tsx`

- [ ] **Step 1: Write the failing reader tests**

```ts
it("shows an Edge support warning when browser TTS is unsupported", async () => {
  renderReaderPage({ browserTtsSupported: false });
  expect(await screen.findByText(/optimized for microsoft edge on desktop/i)).toBeInTheDocument();
});

it("starts selection read aloud without a helper url", async () => {
  renderReaderPage({ browserTtsSupported: true });
  await user.click(await screen.findByRole("button", { name: /read aloud/i }));
  expect(fakeBrowserTtsClient.speakSelection).toHaveBeenCalled();
});

it("starts continuous reading and advances across multiple segments", async () => {
  renderReaderPage({ browserTtsSupported: true });
  await user.click(screen.getByRole("button", { name: /start tts/i }));
  expect(fakeBrowserTtsClient.speakSelection).toHaveBeenCalledWith(expect.stringContaining("First"));
  fakeBrowserTtsClient.finishCurrent();
  expect(fakeBrowserTtsClient.speakSelection).toHaveBeenCalledWith(expect.stringContaining("Second"));
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run src/features/reader/ReaderPage.test.tsx src/features/reader/panels/TtsStatusPanel.test.tsx src/features/reader/selectionActions.test.tsx`

Expected: FAIL because the reader still constructs a localhost TTS client.

- [ ] **Step 3: Write the minimal reader migration**

Update `ReaderPage.tsx` so that:

- it uses `createBrowserTtsClient()` instead of `createLocalTtsClient()`
- it loads browser voices during page readiness
- selection `Read aloud` no longer depends on `helperUrl`
- `Start TTS` uses the paragraph queue with the browser client
- unsupported browsers produce an explicit support message

Update `TtsStatusPanel.tsx` to show:

- `Ready`
- `Playing`
- `Paused`
- `Error`
- `TTS is optimized for Microsoft Edge on desktop`

Remove any remaining `ttsHelperUrl` assumptions from `aiService.ts`.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx vitest run src/features/reader/ReaderPage.test.tsx src/features/reader/panels/TtsStatusPanel.test.tsx src/features/reader/selectionActions.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/ReaderPage.test.tsx src/features/reader/panels/TtsStatusPanel.tsx src/features/reader/panels/TtsStatusPanel.test.tsx src/features/ai/aiService.ts src/features/reader/selectionActions.test.tsx
git commit -m "feat: route reader playback through browser tts"
```

## Chunk 3: Cleanup and Verification

### Task 5: Retire localhost TTS runtime artifacts and switch browser tests to speech mocks

**Files:**
- Delete: `src/features/tts/localTtsClient.ts`
- Delete: `src/features/tts/localTtsClient.test.ts`
- Delete: `scripts/setup-qwen3-tts-venv.sh`
- Delete: `scripts/run-qwen3-tts-service.sh`
- Delete: `tts/kokoro_tts_service/README.md`
- Delete: `tts/kokoro_tts_service/__init__.py`
- Delete: `tts/kokoro_tts_service/__main__.py`
- Delete: `tts/kokoro_tts_service/app.py`
- Delete: `tts/kokoro_tts_service/config.py`
- Delete: `tts/kokoro_tts_service/kokoro_runtime.py`
- Delete: `tts/kokoro_tts_service/runtime.py`
- Delete: `tts/kokoro_tts_service/schemas.py`
- Delete: `tts/kokoro_tts_service/voices.py`
- Delete: `tts/kokoro_tts_service/tests/conftest.py`
- Delete: `tts/kokoro_tts_service/tests/test_api.py`
- Delete: `tts/kokoro_tts_service/tests/test_kokoro_runtime.py`
- Modify: `tests/e2e/local-tts.spec.ts`
- Modify: `tests/e2e/tts-pwa-security.spec.ts`
- Modify: `tests/e2e/ai-actions.spec.ts`

- [ ] **Step 1: Write the failing browser TTS e2e expectations**

```ts
test("desktop edge path uses speechSynthesis instead of localhost tts endpoints", async ({ page }) => {
  await installSpeechSynthesisMock(page, { browserName: "Microsoft Edge" });
  await page.goto("/");
  await importFixtureBook(page);
  await page.click("button:has-text('Start TTS')");
  await expect(page.getByText(/playing/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx playwright test tests/e2e/local-tts.spec.ts tests/e2e/tts-pwa-security.spec.ts`

Expected: FAIL because the tests still intercept localhost TTS HTTP routes.

- [ ] **Step 3: Write the minimal cleanup and test migration**

Delete localhost-TTS code and scripts listed above.

Update Playwright tests to:

- install a `speechSynthesis` mock in the page
- simulate `voiceschanged`
- simulate utterance lifecycle:
  - start
  - end
  - error

Ensure no test relies on `http://127.0.0.1:43115/*`.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx playwright test tests/e2e/local-tts.spec.ts tests/e2e/tts-pwa-security.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/local-tts.spec.ts tests/e2e/tts-pwa-security.spec.ts tests/e2e/ai-actions.spec.ts
git add -u src/features/tts scripts tts/kokoro_tts_service
git commit -m "refactor: remove localhost tts runtime artifacts"
```

### Task 6: Run full regression verification

**Files:**
- No code changes

- [ ] **Step 1: Run the browser TTS unit and integration suite**

Run: `npx vitest run src/features/tts/browserTtsClient.test.ts src/features/tts/chunkText.test.ts src/features/tts/ttsQueue.test.ts src/features/settings/settingsDialog.test.tsx src/features/reader/ReaderPage.test.tsx src/features/reader/panels/TtsStatusPanel.test.tsx src/features/reader/selectionActions.test.tsx`

Expected: PASS

- [ ] **Step 2: Run the e2e suite**

Run: `npx playwright test`

Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: build succeeds

- [ ] **Step 4: Verify no active code path references localhost TTS**

Run: `rg -n "43115|ttsHelperUrl|localTtsClient|kokoro_tts_service|qwen3_tts_service" src tests scripts tts`

Expected:
- no matches under active source files
- only historical docs may remain

- [ ] **Step 5: Commit final verification notes if code changed during cleanup**

```bash
git status --short
```

Expected: clean working tree
