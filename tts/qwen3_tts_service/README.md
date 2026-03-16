# Qwen3-TTS Local Service

Local FastAPI service for the EPUB reader TTS path. It exposes:

- `GET /health`
- `GET /voices`
- `POST /speak`

## Setup

```bash
bash scripts/setup-qwen3-tts-venv.sh
```

## Run

```bash
bash scripts/run-qwen3-tts-service.sh
```

The service listens on `127.0.0.1:43115`.

The process binds the port immediately and reports `warming_up` from `/health`
until the first successful synthesis loads the model.

On a CPU-first machine, the first `/speak` request can take a few minutes while
the model loads and warms up.

If `sox` is missing, `qwen-tts` may print a warning during startup or first
synthesis. The current service path still works without it, but installing
`sox` is recommended to match the upstream runtime expectations.

## Health

```bash
curl http://127.0.0.1:43115/health
```

## Voices

```bash
curl http://127.0.0.1:43115/voices
```

## Speak

```bash
curl \
  -X POST http://127.0.0.1:43115/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello from the local Qwen3-TTS service.",
    "voiceId": "Ryan",
    "rate": 1.0,
    "volume": 1.0,
    "format": "wav"
  }' \
  --output sample.wav
```
