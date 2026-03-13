# OpenAI Browser Spike

Date: 2026-03-13

## Official Contract Notes

- OpenAI authentication docs require `Authorization: Bearer <API_KEY>` headers and explicitly warn not to expose API keys in client-side code.
- Text generation is implemented against `POST https://api.openai.com/v1/responses`.
- Speech generation is implemented against `POST https://api.openai.com/v1/audio/speech`.
- The MVP still keeps this path because the product decision is a user-supplied key stored only in the local browser profile.

## Current Implementation Status

- Added a browser spike route at `/spike/openai`.
- Added one adapter contract for translate, explain, and TTS.
- Added a shared audio player path that can load speech blobs and play them in the browser.
- Added normalized adapter errors for auth, quota/billing, network/CORS, abort, and provider failures.

## Manual Verification

- Pending. No real OpenAI API key was available in this session, so direct browser validation has not been completed yet.
- Before shipping AI features, manually verify translation, explanation, and speech from `/spike/openai` in Chromium with a real key.
- If browser requests fail because of auth policy or CORS behavior, remove AI features from MVP rather than adding a backend proxy in this phase.
