# EPUB Reader Kokoro Realtime TTS Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Qwen-based localhost TTS path with a Kokoro-based low-latency local service and adapt the reader so warmed selection and continuous playback begin in under 3 seconds on the target AMD machine.

**Architecture:** Build a new `tts/kokoro_tts_service/` FastAPI service that exposes `/health`, `/voices`, `/prewarm`, and `/speak` on the existing localhost port. Keep the browser-side HTTP contract simple, but change continuous reading from sentence-heavy micro-requests to paragraph-first segments with a two-segment lookahead queue and explicit warming/generating status.

**Tech Stack:** Python 3, `kokoro`, `misaki[en]`, `soundfile`, FastAPI, Uvicorn, pytest, React, TypeScript, Vitest, Playwright

---

## Planned File Structure

- Service environment and startup
  - Modify: `scripts/setup-qwen3-tts-venv.sh`
  - Modify: `scripts/run-qwen3-tts-service.sh`
- New Kokoro service package
  - Create: `tts/kokoro_tts_service/__init__.py`
  - Create: `tts/kokoro_tts_service/__main__.py`
  - Create: `tts/kokoro_tts_service/app.py`
  - Create: `tts/kokoro_tts_service/config.py`
  - Create: `tts/kokoro_tts_service/kokoro_runtime.py`
  - Create: `tts/kokoro_tts_service/runtime.py`
  - Create: `tts/kokoro_tts_service/schemas.py`
  - Create: `tts/kokoro_tts_service/voices.py`
  - Create: `tts/kokoro_tts_service/README.md`
  - Create: `tts/kokoro_tts_service/tests/conftest.py`
  - Create: `tts/kokoro_tts_service/tests/test_api.py`
  - Create: `tts/kokoro_tts_service/tests/test_kokoro_runtime.py`
- Reader-side TTS contract and settings
  - Modify: `src/features/tts/localTtsClient.ts`
  - Modify: `src/features/tts/localTtsClient.test.ts`
  - Modify: `src/features/settings/settingsRepository.ts`
  - Modify: `src/features/settings/SettingsDialog.tsx`
  - Modify: `src/features/settings/settingsDialog.test.tsx`
- Reader chunking and queue
  - Modify: `src/features/tts/chunkText.ts`
  - Modify: `src/features/tts/chunkText.test.ts`
  - Modify: `src/features/tts/ttsQueue.ts`
  - Modify: `src/features/tts/ttsQueue.test.ts`
- Reader TTS UX
  - Modify: `src/features/reader/ReaderPage.tsx`
  - Modify: `src/features/reader/ReaderPage.test.tsx`
  - Modify: `src/features/reader/panels/TtsStatusPanel.tsx`
  - Modify: `src/features/reader/panels/TtsStatusPanel.test.tsx`
  - Modify: `tests/e2e/tts-pwa-security.spec.ts`
- Retirement of Qwen playback artifacts
  - Delete: `tts/qwen3_tts_service/README.md`
  - Delete: `tts/qwen3_tts_service/__init__.py`
  - Delete: `tts/qwen3_tts_service/__main__.py`
  - Delete: `tts/qwen3_tts_service/app.py`
  - Delete: `tts/qwen3_tts_service/config.py`
  - Delete: `tts/qwen3_tts_service/qwen_runtime.py`
  - Delete: `tts/qwen3_tts_service/runtime.py`
  - Delete: `tts/qwen3_tts_service/schemas.py`
  - Delete: `tts/qwen3_tts_service/voices.py`
  - Delete: `tts/qwen3_tts_service/tests/conftest.py`
  - Delete: `tts/qwen3_tts_service/tests/test_api.py`
  - Delete: `tts/qwen3_tts_service/tests/test_qwen_runtime.py`

## Chunk 1: Kokoro Service Contract and Repo Scripts

### Task 1: Repoint the setup and run scripts at Kokoro dependencies

**Files:**
- Modify: `scripts/setup-qwen3-tts-venv.sh`
- Modify: `scripts/run-qwen3-tts-service.sh`

- [ ] **Step 1: Write the failing repo setup expectation by inspection**

Confirm the setup script still installs `qwen-tts` instead of `kokoro`.

- [ ] **Step 2: Verify the gap exists**

Run: `rg -n "qwen-tts|kokoro|misaki|espeak" scripts/setup-qwen3-tts-venv.sh scripts/run-qwen3-tts-service.sh`

Expected:
- `qwen-tts` is present
- `kokoro` is absent

- [ ] **Step 3: Write the minimal script changes**

Update `scripts/setup-qwen3-tts-venv.sh` to install:

```bash
"$VENV_PATH/bin/pip" install -U \
  "kokoro>=0.9.4" \
  soundfile \
  "misaki[en]" \
  fastapi \
  uvicorn \
  pytest \
  httpx
```

Update `scripts/run-qwen3-tts-service.sh` to launch:

```bash
exec "$REPO_ROOT/.venv/bin/python" -m tts.kokoro_tts_service
```

Also add a clear `espeak-ng` check in the run script:

```bash
command -v espeak-ng >/dev/null || {
  echo "Missing espeak-ng. Install it before starting Kokoro." >&2
  exit 1
}
```

- [ ] **Step 4: Verify the scripts now target Kokoro**

Run: `rg -n "kokoro|misaki|tts.kokoro_tts_service|espeak-ng" scripts/setup-qwen3-tts-venv.sh scripts/run-qwen3-tts-service.sh`

Expected:
- `kokoro` and `misaki[en]` are present
- `tts.kokoro_tts_service` is present

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-qwen3-tts-venv.sh scripts/run-qwen3-tts-service.sh
git commit -m "chore: repoint local tts scripts to kokoro"
```

### Task 2: Scaffold the new Kokoro service with fake runtime contracts

**Files:**
- Create: `tts/kokoro_tts_service/__init__.py`
- Create: `tts/kokoro_tts_service/__main__.py`
- Create: `tts/kokoro_tts_service/app.py`
- Create: `tts/kokoro_tts_service/config.py`
- Create: `tts/kokoro_tts_service/runtime.py`
- Create: `tts/kokoro_tts_service/schemas.py`
- Create: `tts/kokoro_tts_service/voices.py`
- Create: `tts/kokoro_tts_service/tests/conftest.py`
- Create: `tts/kokoro_tts_service/tests/test_api.py`

- [ ] **Step 1: Write the failing API tests**

```python
def test_health_reports_kokoro_backend(client):
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["backend"] == "kokoro"
    assert "warmed" in payload
    assert "device" in payload

def test_voices_returns_curated_english_voices(client):
    response = client.get("/voices")
    payload = response.json()
    assert response.status_code == 200
    assert [voice["id"] for voice in payload] == ["af_heart", "af_bella", "am_adam", "am_michael"]

def test_prewarm_reports_success(client):
    response = client.post("/prewarm")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pytest -q tts/kokoro_tts_service/tests/test_api.py`

Expected: FAIL because the package and routes do not exist.

- [ ] **Step 3: Implement the minimal fake service**

Create:

- `config.py` with host, port, backend name, default voice list
- `schemas.py` with `HealthResponse`, `VoiceResponse`, `PrewarmResponse`, `SpeakRequest`
- `voices.py` with exactly four curated voices:

```python
VOICE_CATALOG = [
    {"id": "af_heart", "displayName": "Heart", "locale": "en-US", "gender": "female", "isDefault": True},
    {"id": "af_bella", "displayName": "Bella", "locale": "en-US", "gender": "female", "isDefault": False},
    {"id": "am_adam", "displayName": "Adam", "locale": "en-US", "gender": "male", "isDefault": False},
    {"id": "am_michael", "displayName": "Michael", "locale": "en-US", "gender": "male", "isDefault": False},
]
```

- `runtime.py` with a fake runtime that reports:

```python
{"status": "warming_up", "warmed": False, "device": "uninitialized"}
```

- `app.py` with:
  - `GET /health`
  - `GET /voices`
  - `POST /prewarm`

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `pytest -q tts/kokoro_tts_service/tests/test_api.py`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tts/kokoro_tts_service
git commit -m "feat: scaffold kokoro local service contract"
```

### Task 3: Add `/speak` with a fake wav first

**Files:**
- Modify: `tts/kokoro_tts_service/app.py`
- Modify: `tts/kokoro_tts_service/runtime.py`
- Modify: `tts/kokoro_tts_service/schemas.py`
- Modify: `tts/kokoro_tts_service/tests/test_api.py`

- [ ] **Step 1: Write the failing `/speak` tests**

```python
def test_speak_returns_wav_audio(client):
    response = client.post("/speak", json={
        "text": "Hello world",
        "voiceId": "af_heart",
        "rate": 1.0,
        "volume": 1.0,
        "format": "wav",
    })
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"

def test_speak_rejects_unknown_voice(client):
    response = client.post("/speak", json={
        "text": "Hello world",
        "voiceId": "unknown",
        "rate": 1.0,
        "volume": 1.0,
        "format": "wav",
    })
    assert response.status_code == 400
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pytest -q tts/kokoro_tts_service/tests/test_api.py`

Expected: FAIL because `/speak` does not exist.

- [ ] **Step 3: Implement the minimal fake synthesis path**

Add:

- `SpeakRequest`
- fake `synthesize()` returning a tiny valid wav
- `/speak` route validating:
  - non-empty `text`
  - `voiceId` exists
  - `format == "wav"`

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `pytest -q tts/kokoro_tts_service/tests/test_api.py`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tts/kokoro_tts_service
git commit -m "feat: add kokoro speak endpoint contract"
```

## Chunk 2: Real Kokoro Runtime on AMD GPU

### Task 4: Add runtime tests for device selection, prewarm, and synthesis mapping

**Files:**
- Create: `tts/kokoro_tts_service/kokoro_runtime.py`
- Create: `tts/kokoro_tts_service/tests/test_kokoro_runtime.py`

- [ ] **Step 1: Write the failing runtime tests**

```python
def test_kokoro_runtime_prefers_cuda_when_available():
    runtime = KokoroRuntime(...)
    assert runtime._resolve_device() == "cuda:0"

def test_prewarm_marks_runtime_as_warmed():
    runtime = KokoroRuntime(pipeline_loader=fake_loader)
    runtime.prewarm()
    assert runtime.get_status()["warmed"] is True

def test_synthesize_collects_generator_audio_into_single_wav():
    fake_pipeline = MagicMock()
    fake_pipeline.return_value = iter([
        ("First", "F ER S T", np.array([0.0, 0.1], dtype=np.float32)),
        ("Second", "S EH K AH N D", np.array([0.2, 0.3], dtype=np.float32)),
    ])
    runtime = KokoroRuntime(pipeline_loader=lambda: fake_pipeline)
    audio = runtime.synthesize("First Second", "af_heart", rate=1.0, volume=1.0)
    assert audio.startswith(b"RIFF")
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pytest -q tts/kokoro_tts_service/tests/test_kokoro_runtime.py`

Expected: FAIL because `KokoroRuntime` does not exist.

- [ ] **Step 3: Implement the minimal runtime**

Implement `kokoro_runtime.py` with:

- lazy pipeline loading
- device resolution:

```python
device = "cuda:0" if torch.cuda.is_available() else "cpu"
```

- pipeline creation modeled on the official library shape:

```python
from kokoro import KPipeline
pipeline = KPipeline(lang_code="a")
```

- `prewarm()` using a tiny English phrase
- `synthesize()` that:
  - calls the pipeline
  - iterates the generator
  - concatenates returned `audio` arrays
  - writes a single wav payload

- [ ] **Step 4: Run the focused runtime tests to verify they pass**

Run: `pytest -q tts/kokoro_tts_service/tests/test_kokoro_runtime.py`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tts/kokoro_tts_service
git commit -m "feat: add kokoro runtime"
```

### Task 5: Wire the real Kokoro runtime into the service and document it

**Files:**
- Modify: `tts/kokoro_tts_service/app.py`
- Modify: `tts/kokoro_tts_service/runtime.py`
- Modify: `tts/kokoro_tts_service/__main__.py`
- Create: `tts/kokoro_tts_service/README.md`
- Modify: `tts/kokoro_tts_service/tests/test_api.py`

- [ ] **Step 1: Write the failing integration expectations**

Extend `test_api.py` to assert:

```python
def test_health_reports_device_and_warmed_state(client):
    payload = client.get("/health").json()
    assert payload["backend"] == "kokoro"
    assert "device" in payload
    assert "warmed" in payload
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pytest -q tts/kokoro_tts_service/tests/test_api.py`

Expected: FAIL because the health shape still reflects the fake runtime.

- [ ] **Step 3: Wire the real service**

Update:

- `app.py` to create `KokoroRuntime`
- `runtime.py` to define a shared base interface:
  - `get_status()`
  - `list_voices()`
  - `prewarm()`
  - `synthesize()`
- `__main__.py` to run `create_app(runtime=KokoroRuntime.from_environment())`
- `README.md` to document:
  - `pip install kokoro>=0.9.4 soundfile misaki[en]`
  - `espeak-ng` requirement
  - `POST /prewarm`
  - curated voices

- [ ] **Step 4: Run the service tests to verify they pass**

Run: `pytest -q tts/kokoro_tts_service/tests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tts/kokoro_tts_service scripts/setup-qwen3-tts-venv.sh scripts/run-qwen3-tts-service.sh
git commit -m "feat: wire kokoro localhost service"
```

## Chunk 3: Reader Contract, Voice Settings, and Paragraph-First Segmentation

### Task 6: Update the browser TTS contract from Qwen-specific health to Kokoro health

**Files:**
- Modify: `src/features/tts/localTtsClient.ts`
- Modify: `src/features/tts/localTtsClient.test.ts`

- [ ] **Step 1: Write the failing client tests**

Add coverage for:

```ts
expect(await client.getHealth()).toMatchObject({
  backend: "kokoro",
  warmed: true,
  device: "cuda:0",
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run src/features/tts/localTtsClient.test.ts`

Expected: FAIL because `LocalTtsHealth` does not include `warmed` or `device`, and the test still expects `qwen3-tts`.

- [ ] **Step 3: Implement the minimal client changes**

Update `LocalTtsHealth`:

```ts
export type LocalTtsHealth = {
  backend: string;
  device: string;
  status: string;
  version: string;
  voiceCount: number;
  warmed: boolean;
};
```

Keep `getVoices()` and `speak()` stable.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx vitest run src/features/tts/localTtsClient.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/tts/localTtsClient.ts src/features/tts/localTtsClient.test.ts
git commit -m "feat: add kokoro health fields to tts client"
```

### Task 7: Change settings defaults and UI to curated Kokoro voices

**Files:**
- Modify: `src/features/settings/settingsRepository.ts`
- Modify: `src/features/settings/SettingsDialog.tsx`
- Modify: `src/features/settings/settingsDialog.test.tsx`

- [ ] **Step 1: Write the failing settings tests**

Update tests to expect:

```ts
expect(createDefaultSettings("localhost")).toMatchObject({
  ttsVoice: "af_heart",
});
```

Also add a test that the dialog renders a select with Kokoro voices returned from `GET /voices`.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run src/features/settings/settingsDialog.test.tsx`

Expected: FAIL because the current default voice is `Ryan` and the dialog still uses a free-text voice input.

- [ ] **Step 3: Implement the minimal settings changes**

Update defaults and migrations:

```ts
if (record.ttsVoice === "Ryan" || record.ttsVoice === "system-default" || record.ttsVoice === "disabled") {
  migratedSettings.ttsVoice = "af_heart";
}
```

Update `SettingsDialog.tsx` to:

- load `GET /voices`
- render `TTS voice` as a `<select>`
- show a status string like `Local translation is enabled. Kokoro is available through the configured localhost service.`

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx vitest run src/features/settings/settingsDialog.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/settingsRepository.ts src/features/settings/SettingsDialog.tsx src/features/settings/settingsDialog.test.tsx
git commit -m "feat: add kokoro voice settings"
```

### Task 8: Replace sentence-heavy chunking with paragraph-first segment planning

**Files:**
- Modify: `src/features/tts/chunkText.ts`
- Modify: `src/features/tts/chunkText.test.ts`

- [ ] **Step 1: Write the failing chunking tests**

Add tests like:

```ts
it("keeps short paragraphs together for the first segment", () => {
  expect(chunkText("One.\n\nTwo.\n\nThree.", { firstSegmentMax: 80, segmentMax: 120 })).toEqual([
    "One. Two. Three.",
  ]);
});

it("keeps a smaller first segment and larger later segments", () => {
  const chunks = chunkText(longNovelText, { firstSegmentMax: 280, segmentMax: 500 });
  expect(chunks[0].length).toBeLessThanOrEqual(280);
  expect(chunks[1].length).toBeLessThanOrEqual(500);
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run src/features/tts/chunkText.test.ts`

Expected: FAIL because `chunkText()` only accepts a numeric max and still over-splits at sentence boundaries.

- [ ] **Step 3: Implement the minimal chunking rewrite**

Change the API to:

```ts
type ChunkOptions = {
  firstSegmentMax?: number;
  segmentMax?: number;
};
```

Implement paragraph-first behavior:

- normalize paragraphs
- merge adjacent short paragraphs
- split oversized paragraphs by sentence
- keep `chunks[0]` biased smaller than later chunks

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx vitest run src/features/tts/chunkText.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/tts/chunkText.ts src/features/tts/chunkText.test.ts
git commit -m "feat: add paragraph first kokoro chunking"
```

## Chunk 4: Queue Lookahead, Reader UX, and Browser Verification

### Task 9: Change the queue to maintain a two-segment lookahead and status wording

**Files:**
- Modify: `src/features/tts/ttsQueue.ts`
- Modify: `src/features/tts/ttsQueue.test.ts`
- Modify: `src/features/reader/panels/TtsStatusPanel.tsx`
- Modify: `src/features/reader/panels/TtsStatusPanel.test.tsx`

- [ ] **Step 1: Write the failing queue/status tests**

Add tests asserting:

```ts
expect(speak).toHaveBeenNthCalledWith(1, expect.objectContaining({ text: chunks[0] }));
expect(speak).toHaveBeenNthCalledWith(2, expect.objectContaining({ text: chunks[1] }));
expect(screen.getByText(/tts status: warming_up/i)).toBeInTheDocument();
expect(screen.getByText(/tts status: generating next segment/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run src/features/tts/ttsQueue.test.ts src/features/reader/panels/TtsStatusPanel.test.tsx`

Expected: FAIL because the queue only prefetches one next chunk and the status panel only knows `loading`.

- [ ] **Step 3: Implement the minimal queue/state changes**

Update `ttsQueue.ts` to:

- request chunks `0` and `1` before playback starts
- keep at most one future segment beyond the currently playing segment
- expose clearer queue states:
  - `warming_up`
  - `loading`
  - `playing`
  - `paused`
  - `error`

Update `TtsStatusPanel.tsx` labels:

```ts
if (status === "warming_up") return "Warming up model";
if (status === "loading") return "Generating next segment";
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx vitest run src/features/tts/ttsQueue.test.ts src/features/reader/panels/TtsStatusPanel.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/tts/ttsQueue.ts src/features/tts/ttsQueue.test.ts src/features/reader/panels/TtsStatusPanel.tsx src/features/reader/panels/TtsStatusPanel.test.tsx
git commit -m "feat: add kokoro tts lookahead queue"
```

### Task 10: Wire ReaderPage to Kokoro warmup health and the new chunking behavior

**Files:**
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/ReaderPage.test.tsx`

- [ ] **Step 1: Write the failing reader tests**

Add tests for:

```ts
it("shows warming up before kokoro health reports warmed", async () => { ... })
it("starts continuous reading with paragraph sized chunks", async () => { ... })
it("keeps selection read aloud on the same local speak contract", async () => { ... })
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run src/features/reader/ReaderPage.test.tsx`

Expected: FAIL because `ReaderPage` does not consume Kokoro health state and still calls `chunkText(text)` with the legacy behavior.

- [ ] **Step 3: Implement the minimal reader changes**

Update `ReaderPage.tsx` so continuous playback:

- fetches TTS health before enabling `Start TTS`
- surfaces `warming_up` while the service is not warmed
- uses:

```ts
const chunks = chunkText(text, {
  firstSegmentMax: 280,
  segmentMax: 500,
});
```

- starts the queue with the new multi-segment lookahead
- keeps selection `Read aloud` on the same `POST /speak` path

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx vitest run src/features/reader/ReaderPage.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/ReaderPage.test.tsx
git commit -m "feat: wire reader page to kokoro tts flow"
```

### Task 11: Add browser verification and retire Qwen playback files

**Files:**
- Modify: `tests/e2e/tts-pwa-security.spec.ts`
- Delete: `tts/qwen3_tts_service/README.md`
- Delete: `tts/qwen3_tts_service/__init__.py`
- Delete: `tts/qwen3_tts_service/__main__.py`
- Delete: `tts/qwen3_tts_service/app.py`
- Delete: `tts/qwen3_tts_service/config.py`
- Delete: `tts/qwen3_tts_service/qwen_runtime.py`
- Delete: `tts/qwen3_tts_service/runtime.py`
- Delete: `tts/qwen3_tts_service/schemas.py`
- Delete: `tts/qwen3_tts_service/voices.py`
- Delete: `tts/qwen3_tts_service/tests/conftest.py`
- Delete: `tts/qwen3_tts_service/tests/test_api.py`
- Delete: `tts/qwen3_tts_service/tests/test_qwen_runtime.py`

- [ ] **Step 1: Write the failing browser test**

Add an end-to-end case that:

- opens the reader
- starts TTS on a warmed Kokoro service
- verifies the UI transitions through `warming_up` or `generating next segment`
- verifies it reaches `playing`

- [ ] **Step 2: Run the focused browser test to verify it fails**

Run: `npx playwright test tests/e2e/tts-pwa-security.spec.ts`

Expected: FAIL because the browser test still assumes the old Qwen runtime behavior.

- [ ] **Step 3: Update the browser test and delete Qwen playback artifacts**

Update the browser assertions for the new Kokoro states, then delete the old `tts/qwen3_tts_service/` tree once all Kokoro tests are green.

- [ ] **Step 4: Run full verification**

Run:

```bash
pytest -q tts/kokoro_tts_service/tests
npx vitest run
npx playwright test
npm run build
```

Expected:
- Python tests pass
- Vitest passes
- Playwright passes
- build succeeds

- [ ] **Step 5: Record manual latency checks**

Run and record on the target machine:

```bash
curl -s http://127.0.0.1:43115/health
curl -X POST http://127.0.0.1:43115/prewarm
```

Then measure:

- warmed selection playback time to first sound
- warmed continuous playback time to first sound
- gap between first and second segments

Expected targets:

- first audible output `< 3s`
- segment gap roughly `<= 1s` on typical novel text

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/tts-pwa-security.spec.ts tts/kokoro_tts_service scripts/setup-qwen3-tts-venv.sh scripts/run-qwen3-tts-service.sh src/features/tts src/features/settings src/features/reader
git add -u tts/qwen3_tts_service
git commit -m "feat: replace qwen playback with kokoro realtime tts"
```
