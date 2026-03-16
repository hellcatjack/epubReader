# EPUB Reader Qwen3-TTS Local Service Design

**Date:** 2026-03-16

## Summary

Replace the Windows voice helper with a Linux-hosted local Qwen3-TTS service that runs beside the EPUB reader stack and exposes the same loopback HTTP contract the reader already consumes.

The service will run from a project-local `.venv` in this repository, not from `/data/Qwen3-ASR/.venv`, and will keep the reader-side API stable so selection playback and continuous reading can switch backends without redesigning the UI.

## Product Goal

The reader must support:

- selection-based read aloud backed by Qwen3-TTS
- continuous reading from the current reading position
- locally hosted synthesis on the machine running Ubuntu
- no browser-side direct model execution
- a stable localhost HTTP interface for the reader

## Scope

### In Scope

- a standalone local TTS service implemented with `FastAPI`
- a project-local Python environment at `.venv`
- `Qwen3-TTS` integration using the Python package
- compatibility with the existing reader-side endpoints:
  - `GET /health`
  - `GET /voices`
  - `POST /speak`
- reader integration through the already-existing TTS client and queue
- a first-pass voice catalog backed by Qwen preset speakers
- support for:
  - selected text playback
  - continuous playback from the current reading location

### Out of Scope

- merging TTS into the existing `/data/Qwen3-ASR` vLLM service process
- voice clone in the first pass
- voice design in the first pass
- remote/cloud TTS providers
- sentence-level karaoke highlighting
- packaging as a background system service in the first pass

## Constraints

- The service must run from this repo's own `.venv`, not from `/data/Qwen3-ASR/.venv`.
- The service must keep the current localhost API contract so the reader does not need a TTS redesign.
- The first version should prioritize stable synthesis over maximal feature breadth.
- The current Qwen3-TTS official guidance supports Python package usage and local demo usage directly; its vLLM path is explicitly documented as offline-only today, so online serving should not depend on vLLM-Omni in the first version.

## Why Not Reuse The Existing ASR vLLM Service

The existing `/data/Qwen3-ASR` deployment is structured around speech-to-text and streaming audio ingestion. Qwen3-TTS is a text-to-audio problem with a different model lifecycle, request shape, and output transport.

Sharing deployment habits is reasonable. Sharing the actual ASR service process is not. A separate TTS service gives:

- a cleaner fault boundary
- simpler startup and restart behavior
- no forced coupling between ASR and TTS model versions
- minimal changes to the EPUB reader because its localhost TTS contract stays intact

## Architecture

## Service Layout

The TTS service lives inside this repository, for example under:

- `tts/qwen3_tts_service/`

Suggested internal modules:

- `config.py`
  - port, host, model id, device, defaults
- `runtime.py`
  - singleton model loader and lifecycle state
- `voices.py`
  - Qwen speaker metadata and `/voices` mapping
- `api.py`
  - FastAPI routes and request validation
- `schemas.py`
  - health, voice, and speak request/response models

## Model Strategy

The first implementation should load one model only:

- `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`

This is the recommended starting point because it lowers startup and inference risk compared with `1.7B`, while still giving a controllable, high-quality local voice path.

The service keeps one warm model instance in memory and does not reload per request.

## Reader Integration

The reader already has:

- a local TTS client
- selection read aloud
- a continuous-reading queue
- settings for helper URL, voice, rate, and volume

That integration remains. Only the localhost backend changes.

The reader continues to:

- call `http://127.0.0.1:43115`
- fetch a voice list from `/voices`
- request `audio/wav` from `/speak`
- play the returned blob in the browser

## HTTP API

### `GET /health`

Returns:

- service status
- version
- backend name
- available voice count
- optional model load state

Example response:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "backend": "qwen3-tts",
  "voiceCount": 9
}
```

### `GET /voices`

Returns a normalized list compatible with the reader's current settings model:

- `id`
- `displayName`
- `locale`
- `gender`
- `isDefault`

These are mapped from Qwen's supported preset speakers rather than system-installed OS voices.

Example response:

```json
[
  {
    "id": "Ryan",
    "displayName": "Ryan",
    "locale": "en-US",
    "gender": "male",
    "isDefault": true
  }
]
```

### `POST /speak`

Request body stays compatible with the reader:

- `text`
- `voiceId`
- `rate`
- `volume`
- `format`

Example request:

```json
{
  "text": "Morgan pressed her head into the pillow.",
  "voiceId": "Ryan",
  "rate": 1.0,
  "volume": 1.0,
  "format": "wav"
}
```

Response:

- raw `audio/wav`

## Request Mapping To Qwen3-TTS

The service translates reader requests into `Qwen3-TTS` package calls:

- `text` -> `text`
- `voiceId` -> `speaker`
- language -> inferred from text, with `English` and `Chinese` as the primary first-pass mappings
- `rate` -> first version may be ignored or lightly mapped if Qwen generation controls prove stable
- `volume` -> post-process wav amplitude scaling before response

The service should reject unsupported `voiceId` values with `400`.

## Voice Catalog

The first version exposes a static, explicit Qwen speaker catalog matching the selected model. Each speaker entry includes:

- stable `id`
- human-readable `displayName`
- primary locale
- rough gender label for UI compatibility
- whether it is the default voice

For English-first reading, a sensible default should be one of the English preset speakers such as `Ryan` or `Aiden`.

## Error Handling

- model still loading:
  - `/health` returns `warming_up`
  - `/speak` returns a temporary failure response
- bad input:
  - empty text or unsupported format returns `400`
- unknown voice:
  - return `400`
- synthesis failure:
  - return `500` with a short, plain error body
- service offline:
  - reader already surfaces the helper unavailable state and can keep that behavior

## Deployment

The project creates and owns its own Python environment:

- `.venv`

Dependencies for TTS service runtime should be installed into that environment, including:

- `qwen-tts`
- `fastapi`
- `uvicorn`
- any validated audio/runtime dependencies needed by Qwen3-TTS

The service should have a repo-local startup script such as:

- `scripts/run-qwen3-tts-service.sh`

That script should:

- activate or directly call the project `.venv`
- start the FastAPI app on `127.0.0.1:43115`
- log clear startup information including selected model id

## Testing Strategy

### Service Tests

- request validation tests for `/speak`
- health endpoint tests for startup and voice count
- voice catalog normalization tests
- service tests using a fake runtime before wiring the real model

### Reader Tests

Most reader-side TTS tests should remain valid because the HTTP contract does not change. Only backend labels and example voices may need updates.

### Manual Verification

The service is considered viable when all of the following are true:

- `.venv` boots the TTS service successfully
- `/health` returns `ok` or `warming_up`
- `/voices` returns the Qwen speaker list
- `/speak` returns playable wav data for English text
- the EPUB reader can:
  - read selected text aloud
  - start, pause, resume, and stop continuous reading

## Risks

- `qwen-tts` may introduce dependency tension with the existing frontend toolchain if installed carelessly; isolating it inside the project `.venv` prevents that from leaking into other repos
- actual rate control may not map cleanly to the existing numeric setting in the first pass
- the first model warmup cost may be noticeable, so `warming_up` must be represented honestly
- if local inference latency is too high on the chosen hardware, continuous reading may need prefetch tuning after the first pass
