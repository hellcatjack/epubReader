# Qwen3-TTS Local Service

Local FastAPI service for the EPUB reader TTS path. It exposes:

- `GET /health`
- `GET /voices`
- `POST /speak`

## Setup

```bash
bash scripts/setup-qwen3-tts-venv.sh
```

The setup script pins the ROCm `gfx1151` wheel set that works on the local
`AMD AI Max+ 395 / Radeon 8060S` machine:

- `torch 2.9.1+rocm7.13.0a20260315`
- `torchaudio 2.9.0+rocm7.13.0a20260315`
- `torchvision 0.24.0+rocm7.13.0a20260315`
- `triton 3.5.1+rocm7.13.0a20260315`

## Run

```bash
bash scripts/run-qwen3-tts-service.sh
```

The service listens on `0.0.0.0:43115` so the reader can reach it from the
same host IP that serves the web app, for example `http://192.168.1.31:43115`.

Browser requests from the reader UI are allowed through CORS on this local
service.

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
