# Kokoro Local TTS Service

Local FastAPI service for the EPUB reader TTS path. It exposes:

- `GET /health`
- `GET /voices`
- `POST /prewarm`
- `POST /speak`

## Setup

```bash
bash scripts/setup-qwen3-tts-venv.sh
```

This installs:

- `kokoro>=0.9.4`
- `soundfile`
- `misaki[en]`
- FastAPI runtime and test tools
- ROCm user-space packages pinned for the local AMD machine

`Kokoro` English usage also requires `espeak-ng` to be present on the host.

## Run

```bash
bash scripts/run-qwen3-tts-service.sh
```

The service listens on `0.0.0.0:43115` so the reader can reach it from the same
host IP that serves the web app, for example `http://192.168.1.31:43115`.

## Curated Voices

The first version exposes a small English-first voice set:

- `af_heart`
- `af_bella`
- `am_adam`
- `am_michael`

## Warmup

The service supports an explicit warmup endpoint:

```bash
curl -X POST http://127.0.0.1:43115/prewarm
```

## Speak

```bash
curl \
  -X POST http://127.0.0.1:43115/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello from the local Kokoro TTS service.",
    "voiceId": "af_heart",
    "rate": 1.0,
    "volume": 1.0,
    "format": "wav"
  }' \
  --output sample.wav
```
