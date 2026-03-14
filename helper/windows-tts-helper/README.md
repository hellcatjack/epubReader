# Windows TTS Helper

Thin localhost helper for the EPUB reader. It exposes local Windows voice discovery and speech synthesis over HTTP on `127.0.0.1:43115`.

## Run

```bash
dotnet run --project helper/windows-tts-helper/WindowsTtsHelper.csproj
```

## Check Health

```bash
curl http://127.0.0.1:43115/health
```

Expected shape:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "backend": "windows-native",
  "voiceCount": 1
}
```

## List Voices

```bash
curl http://127.0.0.1:43115/voices
```

## Synthesize Speech

```bash
curl \
  -X POST http://127.0.0.1:43115/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world from the local helper.",
    "voiceId": "system-default",
    "rate": 1.0,
    "volume": 1.0,
    "format": "wav"
  }' \
  --output sample.wav
```

## Notes

- The helper binds to `127.0.0.1` only.
- CORS is limited to `localhost`, loopback, and private LAN origins.
- On non-Windows hosts, `/health` and `/voices` still run, but `/voices` returns an empty list and `/speak` is unsupported.
- The current implementation uses Windows-local PowerShell access to installed voices. Voice availability still depends on what the host Windows speech stack exposes.
