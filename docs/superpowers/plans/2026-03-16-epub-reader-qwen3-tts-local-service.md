# EPUB Reader Qwen3-TTS Local Service Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WinRT helper with a repo-local Qwen3-TTS FastAPI service that runs from the project's own `.venv` and plugs into the existing EPUB reader TTS flow.

**Architecture:** Add a Python service under `tts/qwen3_tts_service/` that exposes `/health`, `/voices`, and `/speak` on `127.0.0.1:43115`. Keep the reader-side HTTP contract stable, first proving the API with a fake runtime and only then wiring the real `qwen-tts` model runtime and deployment scripts.

**Tech Stack:** Python 3, `qwen-tts`, FastAPI, Uvicorn, pytest, React, TypeScript, Vitest, Playwright

---

## Planned File Structure

- Service environment and startup
  - Modify: `.gitignore`
  - Create: `scripts/setup-qwen3-tts-venv.sh`
  - Create: `scripts/run-qwen3-tts-service.sh`
- Python TTS service
  - Create: `tts/qwen3_tts_service/__init__.py`
  - Create: `tts/qwen3_tts_service/config.py`
  - Create: `tts/qwen3_tts_service/schemas.py`
  - Create: `tts/qwen3_tts_service/voices.py`
  - Create: `tts/qwen3_tts_service/runtime.py`
  - Create: `tts/qwen3_tts_service/qwen_runtime.py`
  - Create: `tts/qwen3_tts_service/app.py`
  - Create: `tts/qwen3_tts_service/__main__.py`
  - Create: `tts/qwen3_tts_service/tests/test_api.py`
  - Create: `tts/qwen3_tts_service/tests/test_qwen_runtime.py`
  - Create: `tts/qwen3_tts_service/README.md`
- Reader integration and settings
  - Modify: `src/features/ai/aiService.ts`
  - Modify: `src/features/tts/localTtsClient.ts`
  - Modify: `src/features/tts/localTtsClient.test.ts`
  - Modify: `src/features/settings/settingsRepository.ts`
  - Modify: `src/features/settings/SettingsDialog.tsx`
  - Modify: `src/features/settings/settingsDialog.test.tsx`
  - Modify: `src/features/reader/selectionActions.test.tsx`
  - Modify: `src/features/reader/ReaderPage.test.tsx`
- Browser verification
  - Modify: `tests/e2e/local-tts.spec.ts`

## Chunk 1: Service Skeleton and Repo Environment

### Task 1: Ignore the repo-local virtual environment

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing repo hygiene test by inspection**

Check that `.gitignore` does not yet contain a root `.venv/` entry.

- [ ] **Step 2: Verify the gap exists**

Run: `rg -n "^\\.venv/$" .gitignore`
Expected: no matches

- [ ] **Step 3: Add the minimal ignore rule**

```gitignore
.venv/
```

- [ ] **Step 4: Verify the rule is present**

Run: `rg -n "^\\.venv/$" .gitignore`
Expected: one match

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore repo local python venv"
```

### Task 2: Scaffold the Python service with fake-runtime health and voices

**Files:**
- Create: `tts/qwen3_tts_service/__init__.py`
- Create: `tts/qwen3_tts_service/config.py`
- Create: `tts/qwen3_tts_service/schemas.py`
- Create: `tts/qwen3_tts_service/voices.py`
- Create: `tts/qwen3_tts_service/runtime.py`
- Create: `tts/qwen3_tts_service/app.py`
- Create: `tts/qwen3_tts_service/__main__.py`
- Create: `tts/qwen3_tts_service/tests/test_api.py`

- [ ] **Step 1: Write the failing health and voices API tests**

```python
def test_health_reports_qwen_backend(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["backend"] == "qwen3-tts"

def test_voices_returns_qwen_speakers(client):
    response = client.get("/voices")
    payload = response.json()
    assert response.status_code == 200
    assert any(voice["id"] == "Ryan" for voice in payload)
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pytest tts/qwen3_tts_service/tests/test_api.py -q`
Expected: FAIL because the service package and routes do not exist

- [ ] **Step 3: Implement the minimal fake-runtime service**

Create:

- `config.py` with host, port, model id, backend name
- `schemas.py` with `HealthResponse`, `VoiceResponse`, `SpeakRequest`
- `voices.py` with a static speaker catalog containing at least `Ryan` and `Aiden`
- `runtime.py` with a fake `BaseTtsRuntime` returning `warming_up=False`
- `app.py` with `create_app()` and routes:
  - `GET /health`
  - `GET /voices`

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `pytest tts/qwen3_tts_service/tests/test_api.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tts/qwen3_tts_service
git commit -m "feat: scaffold qwen tts service health and voices"
```

## Chunk 2: `/speak` and the Real Qwen Runtime

### Task 3: Add `/speak` with fake synthesis first

**Files:**
- Modify: `tts/qwen3_tts_service/schemas.py`
- Modify: `tts/qwen3_tts_service/runtime.py`
- Modify: `tts/qwen3_tts_service/app.py`
- Modify: `tts/qwen3_tts_service/tests/test_api.py`

- [ ] **Step 1: Write the failing speak endpoint tests**

```python
def test_speak_returns_wav_audio(client):
    response = client.post("/speak", json={
        "text": "Hello world",
        "voiceId": "Ryan",
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

Run: `pytest tts/qwen3_tts_service/tests/test_api.py -q`
Expected: FAIL because `/speak` is not implemented

- [ ] **Step 3: Implement the minimal fake synthesis path**

Implement:

- `SpeakRequest` schema
- fake runtime `synthesize()` returning a tiny valid wav payload
- `/speak` route that validates:
  - non-empty `text`
  - supported `voiceId`
  - `format == "wav"`

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `pytest tts/qwen3_tts_service/tests/test_api.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tts/qwen3_tts_service
git commit -m "feat: add qwen tts speak endpoint contract"
```

### Task 4: Add the real `qwen-tts` runtime behind the same interface

**Files:**
- Create: `tts/qwen3_tts_service/qwen_runtime.py`
- Create: `tts/qwen3_tts_service/tests/test_qwen_runtime.py`
- Modify: `tts/qwen3_tts_service/runtime.py`
- Modify: `tts/qwen3_tts_service/app.py`

- [ ] **Step 1: Write the failing runtime unit tests with a fake model**

```python
def test_qwen_runtime_maps_speaker_and_language():
    runtime = QwenRuntime(model=fake_model, voice_catalog=VOICE_CATALOG)
    runtime.synthesize("Hello there", "Ryan", rate=1.0, volume=1.0)
    fake_model.generate_custom_voice.assert_called_once()
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pytest tts/qwen3_tts_service/tests/test_qwen_runtime.py -q`
Expected: FAIL because `QwenRuntime` does not exist

- [ ] **Step 3: Implement the minimal real runtime**

Implement `QwenRuntime` that:

- lazily loads `Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", ...)`
- infers language from text:
  - English for mostly ASCII alphabetic text
  - Chinese for CJK-heavy text
  - otherwise `Auto`
- maps `voiceId` to `speaker`
- applies simple post-synthesis volume scaling
- returns wav bytes

- [ ] **Step 4: Run the focused runtime tests**

Run: `pytest tts/qwen3_tts_service/tests/test_qwen_runtime.py -q`
Expected: PASS

- [ ] **Step 5: Run the service tests to ensure API behavior still holds**

Run: `pytest tts/qwen3_tts_service/tests/test_api.py -q`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tts/qwen3_tts_service
git commit -m "feat: wire qwen tts runtime"
```

## Chunk 3: Repo-Local Setup and Service Runbook

### Task 5: Add repo-local setup and run scripts

**Files:**
- Create: `scripts/setup-qwen3-tts-venv.sh`
- Create: `scripts/run-qwen3-tts-service.sh`
- Create: `tts/qwen3_tts_service/README.md`

- [ ] **Step 1: Write the failing runbook expectation by inspection**

Check that no repo-local setup or run script currently exists for the new TTS service.

- [ ] **Step 2: Verify the files are missing**

Run: `test -f scripts/setup-qwen3-tts-venv.sh || echo missing`
Expected: `missing`

Run: `test -f scripts/run-qwen3-tts-service.sh || echo missing`
Expected: `missing`

- [ ] **Step 3: Add the setup and startup scripts**

`setup-qwen3-tts-venv.sh` should:

- create `.venv`
- upgrade `pip`
- install `qwen-tts`, `fastapi`, `uvicorn`, `pytest`, `httpx`

`run-qwen3-tts-service.sh` should:

- call `.venv/bin/python -m tts.qwen3_tts_service`
- bind to `127.0.0.1:43115`

`README.md` should document:

- setup
- start
- `curl /health`
- `curl /voices`
- `curl /speak`

- [ ] **Step 4: Verify the scripts are executable and readable**

Run: `bash -n scripts/setup-qwen3-tts-venv.sh scripts/run-qwen3-tts-service.sh`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-qwen3-tts-venv.sh scripts/run-qwen3-tts-service.sh tts/qwen3_tts_service/README.md
git commit -m "docs: add qwen tts service setup and run scripts"
```

## Chunk 4: Reader Defaults and Browser Verification

### Task 6: Point the reader defaults and copy at Qwen-backed localhost TTS

**Files:**
- Modify: `src/features/ai/aiService.ts`
- Modify: `src/features/tts/localTtsClient.ts`
- Modify: `src/features/tts/localTtsClient.test.ts`
- Modify: `src/features/settings/settingsRepository.ts`
- Modify: `src/features/settings/SettingsDialog.tsx`
- Modify: `src/features/settings/settingsDialog.test.tsx`

- [ ] **Step 1: Write the failing settings/UI tests**

```ts
it("defaults to qwen localhost tts settings", async () => {
  const settings = await getResolvedSettings();
  expect(settings.ttsVoice).toBe("Ryan");
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run src/features/settings/settingsDialog.test.tsx src/features/tts/localTtsClient.test.ts`
Expected: FAIL because the defaults and copy still reflect the previous helper

- [ ] **Step 3: Implement the minimal reader-side adjustments**

Update:

- settings defaults to `ttsVoice: "Ryan"`
- settings copy from Windows helper wording to local Qwen service wording
- `localTtsClient` health expectations to accept backend `qwen3-tts`

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx vitest run src/features/settings/settingsDialog.test.tsx src/features/tts/localTtsClient.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/ai/aiService.ts src/features/tts/localTtsClient.ts src/features/tts/localTtsClient.test.ts src/features/settings/settingsRepository.ts src/features/settings/SettingsDialog.tsx src/features/settings/settingsDialog.test.tsx
git commit -m "feat: point reader defaults at qwen tts service"
```

### Task 7: Verify selection and continuous reading still work through the unchanged contract

**Files:**
- Modify: `src/features/reader/selectionActions.test.tsx`
- Modify: `src/features/reader/ReaderPage.test.tsx`
- Modify: `tests/e2e/local-tts.spec.ts`

- [ ] **Step 1: Write the failing reader/browser assertions**

Add assertions that:

- selection read aloud sends `voice: "Ryan"` by default
- continuous reading still reaches `playing`, `paused`, and `idle`
- browser-side mock service can return `backend: "qwen3-tts"`

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run src/features/reader/selectionActions.test.tsx src/features/reader/ReaderPage.test.tsx`
Expected: FAIL because tests still expect the previous helper semantics

Run: `npx playwright test tests/e2e/local-tts.spec.ts`
Expected: FAIL or require updated mock payloads

- [ ] **Step 3: Implement the minimal test and fixture updates**

Keep the reader HTTP contract unchanged; only update the mocked backend label and default voice assumptions where needed.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx vitest run src/features/reader/selectionActions.test.tsx src/features/reader/ReaderPage.test.tsx`
Expected: PASS

Run: `npx playwright test tests/e2e/local-tts.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/selectionActions.test.tsx src/features/reader/ReaderPage.test.tsx tests/e2e/local-tts.spec.ts
git commit -m "test: verify reader qwen tts integration flow"
```

## Chunk 5: Full Verification and Manual Bring-Up

### Task 8: Run the complete verification suite and document manual bring-up

**Files:**
- Modify: `tts/qwen3_tts_service/README.md`

- [ ] **Step 1: Run Python service tests**

Run: `pytest tts/qwen3_tts_service/tests -q`
Expected: PASS

- [ ] **Step 2: Run frontend unit tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Run browser tests**

Run: `npx playwright test`
Expected: PASS

- [ ] **Step 5: Verify repo-local bring-up commands**

Run:

```bash
bash scripts/setup-qwen3-tts-venv.sh
bash scripts/run-qwen3-tts-service.sh
```

Expected:

- service binds to `127.0.0.1:43115`
- `curl http://127.0.0.1:43115/health` returns `ok` or `warming_up`

- [ ] **Step 6: Update the README with any final manual notes discovered during bring-up**

- [ ] **Step 7: Commit**

```bash
git add tts/qwen3_tts_service/README.md
git commit -m "docs: finalize qwen tts service verification notes"
```
