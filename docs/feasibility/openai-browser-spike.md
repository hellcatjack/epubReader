# Local Translation Spike

Date: 2026-03-13

## Current Contract Notes

- Translation and explanation now target `POST http://192.168.1.31:8001/v1/chat/completions`.
- No authentication header is required for the current local model server.
- TTS is intentionally out of scope for the current development pass and remains disabled in the UI and service layer.

## Current Implementation Status

- Added a browser spike route at `/spike/openai`.
- Added one adapter contract for translate and explain against the local OpenAI-compatible endpoint.
- Added normalized adapter errors for network/CORS, abort, provider failures, and temporary unsupported features.

## Manual Verification

- Pending. Browser requests should be verified against the local server from `/spike/openai`.
- Before shipping the translation feature, manually verify both translate and explain on the local endpoint in Chromium.
