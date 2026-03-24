# EPUB Reader

Browser-based EPUB reader with local-first annotations, in-reader translation and explanation, and desktop-focused TTS controls.

## Development

Install dependencies and run the app:

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm test
npm run e2e
npm run build
```

## AI Providers

The reader supports two translation providers:

- `Local LLM`
- `Gemini BYOK`

Both can be configured in:

- global `Settings`
- the in-reader `Appearance` panel

### Local LLM

- Default endpoint: `http://localhost:8001/v1/chat/completions`
- Accepted forms:
  - `/v1`
  - `/v1/chat/completions`
  - `/v1/completions`
- The app normalizes these internally and also queries `/v1/models` to populate the local model dropdown.
- If the model list does not load, verify that your OpenAI-compatible server exposes `GET /v1/models` and allows browser access from the app origin.

### Gemini BYOK

- Supported models in the UI:
  - `gemini-2.5-flash`
  - `gemini-2.5-flash-lite`
- The app calls Gemini directly from the browser using your own API key.
- The key is stored only in this browser's local settings. It is not bundled into the app and must never be committed to the repo.

## How To Get A Gemini API Key

Use the official Google AI Studio flow:

1. Open [Google AI Studio](https://ai.google.dev/aistudio).
2. Sign in with your Google account.
3. Click **Get API key**.
4. Create a new key from the AI Studio API keys page.
5. Copy the key and keep it private.

Official references:

- [Gemini API quickstart](https://ai.google.dev/gemini-api/docs/quickstart)
- [Using Gemini API keys](https://ai.google.dev/tutorials/setup)
- [Gemini API reference](https://ai.google.dev/api)

### Use The Key In This App

1. Open `Settings` or the reader-side `Appearance` panel.
2. Set `Translation provider` to `Gemini BYOK`.
3. Paste your key into `Gemini API Key`.
4. Choose a Gemini model.
5. Save settings if you are in the global settings dialog.

### Security Notes

- This project currently uses a browser-side BYOK flow for Gemini.
- Google documents that the most secure approach is server-side key usage. For this app, client-side BYOK is intended for personal or self-hosted use, not shared/public deployments.
- Do not use a shared machine or shared browser profile if you do not want other users of that browser profile to access the saved key.

### Pricing, Quotas, And Troubleshooting

Gemini free-tier availability, quotas, and pricing change over time. Check the official pages instead of hard-coding limits into operational decisions:

- [Pricing](https://ai.google.dev/pricing)
- [Quotas and rate limits](https://ai.google.dev/gemini-api/docs/quota)
- [Troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting)

If a newly created key works in AI Studio but fails from this app, review the troubleshooting page and confirm that the key is allowed to call the Gemini API from your environment.

## Deployment

Frontend deploys are static:

```bash
npm run build
rsync -a --delete dist/ /app/epubReader/
```

The published app is served from `/app/epubReader`.

## Project Layout

- `src/app`: app shell and route-level chrome
- `src/features/bookshelf`: library import and bookshelf flows
- `src/features/reader`: reader UI, EPUB runtime, TOC, annotations, TTS integration
- `src/features/ai`: translation, explanation, and endpoint normalization
- `src/features/settings`: persisted reader and AI settings
- `tests/e2e`: Playwright coverage
- `docs/`: design notes, plans, and feasibility writeups

## Privacy And Repo Hygiene

- Do not commit machine-specific IPs or private hostnames into app defaults, examples, or tests.
- Optional local/manual EPUB fixtures belong under `tests/fixtures/local/` and are gitignored.
- Ad-hoc screenshots and scratch files under the repo root are gitignored to avoid accidental commits.
