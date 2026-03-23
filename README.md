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

## Local LLM Endpoint

- The default LLM API URL is `http://localhost:8001/v1/chat/completions`.
- Users can override it in:
  - global `Settings`
  - the in-reader `Appearance` panel
- The app accepts any of these forms and normalizes them internally:
  - `/v1`
  - `/v1/chat/completions`
  - `/v1/completions`

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
