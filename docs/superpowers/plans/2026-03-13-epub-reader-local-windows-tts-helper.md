# EPUB Reader Local Windows TTS Helper Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Windows-only localhost TTS helper and wire the reader to local voice playback for both selected text and continuous reading.

**Architecture:** Build a thin `.NET 8` helper that exposes `/health`, `/voices`, and `/speak` on `127.0.0.1`, then add a reader-side local TTS client and queue manager that consume those endpoints. Keep synthesis local, keep playback in the browser, and keep continuous reading bounded to the current reading location and chapter.

**Tech Stack:** .NET 8, ASP.NET Core Minimal API, React, TypeScript, Vite, Dexie, epub.js, Vitest, React Testing Library, Playwright

---

## Planned File Structure

- Helper application
  - Create: `helper/windows-tts-helper/WindowsTtsHelper.csproj`
  - Create: `helper/windows-tts-helper/Program.cs`
  - Create: `helper/windows-tts-helper/Contracts/HealthResponse.cs`
  - Create: `helper/windows-tts-helper/Contracts/VoiceResponse.cs`
  - Create: `helper/windows-tts-helper/Contracts/SpeakRequest.cs`
  - Create: `helper/windows-tts-helper/Services/IWindowsVoiceService.cs`
  - Create: `helper/windows-tts-helper/Services/WindowsVoiceService.cs`
  - Create: `helper/windows-tts-helper/Services/WindowsSpeechSynthesisService.cs`
  - Create: `helper/windows-tts-helper/Tests/WindowsTtsHelper.Tests.csproj`
  - Create: `helper/windows-tts-helper/Tests/HealthEndpointTests.cs`
  - Create: `helper/windows-tts-helper/Tests/VoicesEndpointTests.cs`
  - Create: `helper/windows-tts-helper/Tests/SpeakEndpointTests.cs`
- Reader TTS client and queue
  - Create: `src/features/tts/localTtsClient.ts`
  - Create: `src/features/tts/localTtsClient.test.ts`
  - Create: `src/features/tts/ttsQueue.ts`
  - Create: `src/features/tts/ttsQueue.test.ts`
  - Create: `src/features/tts/chunkText.ts`
  - Create: `src/features/tts/chunkText.test.ts`
  - Modify: `src/features/tts/audioPlayer.ts`
  - Modify: `src/features/ai/aiService.ts`
- Reader integration
  - Modify: `src/features/reader/SelectionPopover.tsx`
  - Modify: `src/features/reader/ReaderPage.tsx`
  - Modify: `src/features/reader/epubRuntime.ts`
  - Modify: `src/features/reader/EpubViewport.tsx`
  - Modify: `src/features/reader/RightPanel.tsx`
  - Modify: `src/features/reader/panels/TtsStatusPanel.tsx`
  - Modify: `src/features/reader/reader.css`
- Settings and persistence
  - Modify: `src/lib/types/settings.ts`
  - Modify: `src/features/settings/settingsRepository.ts`
  - Modify: `src/features/settings/SettingsDialog.tsx`
  - Modify: `src/features/settings/settingsDialog.test.tsx`
- Browser and unit tests
  - Modify: `src/features/reader/selectionActions.test.tsx`
  - Modify: `src/features/reader/ReaderPage.test.tsx`
  - Create: `tests/e2e/local-tts.spec.ts`
- Docs
  - Create: `helper/windows-tts-helper/README.md`

## Chunk 1: Windows Helper Skeleton

### Task 1: Scaffold the helper project and health endpoint

**Files:**
- Create: `helper/windows-tts-helper/WindowsTtsHelper.csproj`
- Create: `helper/windows-tts-helper/Program.cs`
- Create: `helper/windows-tts-helper/Contracts/HealthResponse.cs`
- Create: `helper/windows-tts-helper/Tests/WindowsTtsHelper.Tests.csproj`
- Create: `helper/windows-tts-helper/Tests/HealthEndpointTests.cs`

- [ ] **Step 1: Write the failing health endpoint test**

```csharp
[Fact]
public async Task GetHealth_ReturnsOkStatus()
{
    using var app = new TestApp();
    var response = await app.Client.GetFromJsonAsync<HealthResponse>("/health");
    response!.Status.Should().Be("ok");
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test helper/windows-tts-helper/Tests/WindowsTtsHelper.Tests.csproj`
Expected: FAIL because the helper project and endpoint do not exist.

- [ ] **Step 3: Implement the minimal helper and `/health`**

```csharp
app.MapGet("/health", () => Results.Ok(new HealthResponse("ok", "0.1.0", "windows-native", 0)));
app.Urls.Add("http://127.0.0.1:43115");
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `dotnet test helper/windows-tts-helper/Tests/WindowsTtsHelper.Tests.csproj --filter GetHealth_ReturnsOkStatus`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add helper/windows-tts-helper
git commit -m "feat: scaffold windows tts helper health endpoint"
```

### Task 2: Add local voice enumeration

**Files:**
- Create: `helper/windows-tts-helper/Contracts/VoiceResponse.cs`
- Create: `helper/windows-tts-helper/Services/IWindowsVoiceService.cs`
- Create: `helper/windows-tts-helper/Services/WindowsVoiceService.cs`
- Create: `helper/windows-tts-helper/Tests/VoicesEndpointTests.cs`
- Modify: `helper/windows-tts-helper/Program.cs`

- [ ] **Step 1: Write the failing voice list test**

```csharp
[Fact]
public async Task GetVoices_ReturnsNormalizedVoices()
{
    using var app = new TestApp(fakeVoices: new[]
    {
        new VoiceResponse("voice-1", "Microsoft Aria", "en-US", "female", true)
    });
    var voices = await app.Client.GetFromJsonAsync<List<VoiceResponse>>("/voices");
    voices!.Should().ContainSingle(v => v.Id == "voice-1");
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test helper/windows-tts-helper/Tests/WindowsTtsHelper.Tests.csproj --filter GetVoices_ReturnsNormalizedVoices`
Expected: FAIL because `/voices` does not exist.

- [ ] **Step 3: Implement the voice service and endpoint**

```csharp
app.MapGet("/voices", async (IWindowsVoiceService voices) => Results.Ok(await voices.GetVoicesAsync()));
```

- [ ] **Step 4: Run the focused helper tests**

Run: `dotnet test helper/windows-tts-helper/Tests/WindowsTtsHelper.Tests.csproj --filter "GetHealth_ReturnsOkStatus|GetVoices_ReturnsNormalizedVoices"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add helper/windows-tts-helper
git commit -m "feat: add windows voice discovery endpoint"
```

## Chunk 2: Speech Synthesis Endpoint

### Task 3: Add `/speak` request validation and audio response

**Files:**
- Create: `helper/windows-tts-helper/Contracts/SpeakRequest.cs`
- Create: `helper/windows-tts-helper/Services/WindowsSpeechSynthesisService.cs`
- Create: `helper/windows-tts-helper/Tests/SpeakEndpointTests.cs`
- Modify: `helper/windows-tts-helper/Program.cs`

- [ ] **Step 1: Write the failing speak test**

```csharp
[Fact]
public async Task PostSpeak_ReturnsWaveAudio()
{
    using var app = new TestApp(fakeAudio: new byte[] { 1, 2, 3 });
    var response = await app.Client.PostAsJsonAsync("/speak", new SpeakRequest("Hello", "voice-1", 1.0, 1.0, "wav"));
    response.Content.Headers.ContentType!.MediaType.Should().Be("audio/wav");
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test helper/windows-tts-helper/Tests/WindowsTtsHelper.Tests.csproj --filter PostSpeak_ReturnsWaveAudio`
Expected: FAIL because `/speak` does not exist.

- [ ] **Step 3: Implement minimal synthesis plumbing**

```csharp
app.MapPost("/speak", async (SpeakRequest request, WindowsSpeechSynthesisService tts) =>
{
    var audio = await tts.SynthesizeAsync(request);
    return Results.File(audio, "audio/wav");
});
```

- [ ] **Step 4: Run the focused helper tests**

Run: `dotnet test helper/windows-tts-helper/Tests/WindowsTtsHelper.Tests.csproj`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add helper/windows-tts-helper
git commit -m "feat: add local speech synthesis endpoint"
```

### Task 4: Document helper startup and manual verification

**Files:**
- Create: `helper/windows-tts-helper/README.md`

- [ ] **Step 1: Write the helper run instructions**

```md
dotnet run --project helper/windows-tts-helper/WindowsTtsHelper.csproj
curl http://127.0.0.1:43115/health
curl http://127.0.0.1:43115/voices
```

- [ ] **Step 2: Verify the commands manually**

Run: `dotnet run --project helper/windows-tts-helper/WindowsTtsHelper.csproj`
Expected: helper starts on `127.0.0.1:43115`

- [ ] **Step 3: Commit**

```bash
git add helper/windows-tts-helper/README.md
git commit -m "docs: add windows tts helper runbook"
```

## Chunk 3: Reader-Side Local TTS Client

### Task 5: Add localhost TTS client

**Files:**
- Create: `src/features/tts/localTtsClient.ts`
- Create: `src/features/tts/localTtsClient.test.ts`

- [ ] **Step 1: Write the failing client test**

```ts
it("requests voices and speech from the local helper", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "voice-1" }])))
    .mockResolvedValueOnce(new Response(new Blob(["a"]), { status: 200 }));
  const client = createLocalTtsClient({ fetch: fetchMock });
  await expect(client.getVoices()).resolves.toHaveLength(1);
  await expect(client.speak({ text: "Hello", voiceId: "voice-1" })).resolves.toBeInstanceOf(Blob);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/tts/localTtsClient.test.ts`
Expected: FAIL because the client does not exist.

- [ ] **Step 3: Implement the local helper client**

```ts
const DEFAULT_TTS_HELPER_URL = "http://127.0.0.1:43115";
```

- [ ] **Step 4: Run the focused test**

Run: `npx vitest run src/features/tts/localTtsClient.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/tts/localTtsClient.ts src/features/tts/localTtsClient.test.ts
git commit -m "feat: add local windows tts client"
```

### Task 6: Add queue and chunking primitives

**Files:**
- Create: `src/features/tts/chunkText.ts`
- Create: `src/features/tts/chunkText.test.ts`
- Create: `src/features/tts/ttsQueue.ts`
- Create: `src/features/tts/ttsQueue.test.ts`
- Modify: `src/features/tts/audioPlayer.ts`

- [ ] **Step 1: Write the failing chunking and queue tests**

```ts
it("splits long text by paragraph and sentence", () => {
  expect(chunkText("One.\n\nTwo.", 40)).toEqual(["One.", "Two."]);
});

it("plays chunks sequentially and supports pause/resume/stop", async () => {
  // assert queue state transitions
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/tts/chunkText.test.ts src/features/tts/ttsQueue.test.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement minimal queue behavior**

```ts
type TtsQueueState = "idle" | "loading" | "playing" | "paused" | "error";
```

- [ ] **Step 4: Run the focused tests**

Run: `npx vitest run src/features/tts/chunkText.test.ts src/features/tts/ttsQueue.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/tts/chunkText.ts src/features/tts/chunkText.test.ts src/features/tts/ttsQueue.ts src/features/tts/ttsQueue.test.ts src/features/tts/audioPlayer.ts
git commit -m "feat: add local tts queue primitives"
```

## Chunk 4: Reader Integration

### Task 7: Restore selection read aloud

**Files:**
- Modify: `src/features/reader/SelectionPopover.tsx`
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/ai/aiService.ts`
- Modify: `src/features/reader/selectionActions.test.tsx`

- [ ] **Step 1: Write the failing reader selection TTS test**

```tsx
it("speaks the selected text through the local helper", async () => {
  const ai = { synthesizeSpeech: vi.fn(async () => new Blob(["a"])) };
  render(<ReaderPage ai={ai} />);
  act(() => selectionBridge.publish({ text: "Hello world" }));
  await user.click(screen.getByRole("button", { name: /read aloud/i }));
  expect(ai.synthesizeSpeech).toHaveBeenCalledWith("Hello world", expect.any(Object));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/reader/selectionActions.test.tsx`
Expected: FAIL because the control is disabled.

- [ ] **Step 3: Implement minimal selection playback**

```tsx
<button disabled={!hasSelection} onClick={onReadAloud}>Read aloud</button>
```

- [ ] **Step 4: Run the focused test**

Run: `npx vitest run src/features/reader/selectionActions.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/SelectionPopover.tsx src/features/reader/ReaderPage.tsx src/features/ai/aiService.ts src/features/reader/selectionActions.test.tsx
git commit -m "feat: restore selection read aloud"
```

### Task 8: Add continuous reading controls and state panel

**Files:**
- Modify: `src/features/reader/panels/TtsStatusPanel.tsx`
- Modify: `src/features/reader/RightPanel.tsx`
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/ReaderPage.test.tsx`
- Modify: `src/features/reader/reader.css`

- [ ] **Step 1: Write the failing continuous-reading test**

```tsx
it("starts, pauses, resumes, and stops continuous reading", async () => {
  render(<ReaderPage runtime={runtimeWithChapterText()} />);
  await user.click(screen.getByRole("button", { name: /start tts/i }));
  await user.click(screen.getByRole("button", { name: /pause tts/i }));
  await user.click(screen.getByRole("button", { name: /resume tts/i }));
  await user.click(screen.getByRole("button", { name: /stop tts/i }));
  expect(screen.getByText(/paused/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/reader/ReaderPage.test.tsx`
Expected: FAIL because the panel is a disabled placeholder.

- [ ] **Step 3: Implement the queue-backed panel**

```tsx
<TtsStatusPanel
  status={ttsState.status}
  onStart={handleStartContinuousTts}
  onPause={handlePauseTts}
  onResume={handleResumeTts}
  onStop={handleStopTts}
/>
```

- [ ] **Step 4: Run the focused test**

Run: `npx vitest run src/features/reader/ReaderPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/panels/TtsStatusPanel.tsx src/features/reader/RightPanel.tsx src/features/reader/ReaderPage.tsx src/features/reader/ReaderPage.test.tsx src/features/reader/reader.css
git commit -m "feat: add continuous local tts controls"
```

## Chunk 5: Settings and End-to-End Validation

### Task 9: Persist helper URL, voice, rate, and volume

**Files:**
- Modify: `src/lib/types/settings.ts`
- Modify: `src/features/settings/settingsRepository.ts`
- Modify: `src/features/settings/SettingsDialog.tsx`
- Modify: `src/features/settings/settingsDialog.test.tsx`

- [ ] **Step 1: Write the failing settings test**

```tsx
it("persists local helper tts fields", async () => {
  await saveSettings({
    ttsHelperUrl: "http://127.0.0.1:43115",
    ttsVoice: "voice-1",
    ttsRate: 1.15,
    ttsVolume: 0.9,
  });
  expect(await getResolvedSettings()).toMatchObject({ ttsVoice: "voice-1", ttsRate: 1.15 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/settings/settingsDialog.test.tsx`
Expected: FAIL because the new TTS fields do not exist.

- [ ] **Step 3: Implement the settings fields and UI**

```tsx
<input aria-label="TTS helper URL" value={settings.ttsHelperUrl} />
<select aria-label="TTS voice" value={settings.ttsVoice} />
```

- [ ] **Step 4: Run the focused test**

Run: `npx vitest run src/features/settings/settingsDialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/settings.ts src/features/settings/settingsRepository.ts src/features/settings/SettingsDialog.tsx src/features/settings/settingsDialog.test.tsx
git commit -m "feat: persist local tts helper settings"
```

### Task 10: Add browser-level e2e coverage for local TTS

**Files:**
- Create: `tests/e2e/local-tts.spec.ts`

- [ ] **Step 1: Write the failing e2e**

```ts
test("selection and continuous reading call the local helper", async ({ page }) => {
  await page.route("http://127.0.0.1:43115/**", route => route.fulfill(...));
  // import test epub, select text, click read aloud, start continuous reading
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/e2e/local-tts.spec.ts`
Expected: FAIL because the reader does not call the helper yet.

- [ ] **Step 3: Complete integration and verify browser behavior**

```ts
await expect(page.getByText(/playing/i)).toBeVisible();
```

- [ ] **Step 4: Run full verification**

Run: `npx vitest run`
Expected: PASS

Run: `dotnet test helper/windows-tts-helper/Tests/WindowsTtsHelper.Tests.csproj`
Expected: PASS

Run: `npm run build`
Expected: PASS

Run: `npx playwright test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/local-tts.spec.ts
git commit -m "test: add local tts end-to-end coverage"
```

## Manual Verification Checklist

- [ ] Start the helper with `dotnet run --project helper/windows-tts-helper/WindowsTtsHelper.csproj`
- [ ] Open `http://127.0.0.1:5173/`
- [ ] Import an EPUB and open the reader
- [ ] Confirm the reader lists at least one local Windows voice
- [ ] Select text and click `Read aloud`
- [ ] Start continuous reading from the current location
- [ ] Pause, resume, and stop playback
- [ ] Change chapter and confirm the queue stops
- [ ] Stop the helper and confirm the reader shows an offline error
