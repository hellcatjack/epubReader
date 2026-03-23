# EPUB Reader MVP Design

**Date:** 2026-03-13

## Summary

Build a desktop-first EPUB reader as a pure frontend PWA. The app supports local bookshelf management, EPUB reading, selection-based translation, AI TTS, and local annotations without any backend service.

The product goal is a clean MVP that makes reading and AI assistance feel integrated, while keeping architecture boundaries clear enough to support later expansion.

## Platform and Compatibility Baseline

- Primary target: latest desktop Chromium-based browsers
- Supported format: DRM-free, reflowable EPUB 2 and EPUB 3
- Explicitly unsupported in MVP:
  - DRM-protected EPUB files
  - fixed-layout EPUB files
  - media-overlay EPUB playback
  - highly interactive EPUB content that depends on custom scripting
- Mobile browsers are not a target for MVP quality. The app may open on them, but the design and testing baseline is desktop only.

## Security and Rendering Isolation Baseline

- Each EPUB spine-item document is rendered inside a sandboxed iframe controlled by the reader
- The iframe sandbox must omit `allow-scripts`, `allow-forms`, and `allow-popups`
- The iframe sandbox uses `allow-same-origin` so the reader can support selection capture, annotation painting, and link interception, but script execution inside book content remains disabled
- Only packaged book resources are loaded automatically for MVP
- External network resources referenced by book content are blocked for MVP
- External hyperlinks inside book content are intercepted by the app shell, require explicit user action, and open in a new browser tab from the parent app context
- The reader must not allow EPUB content to run arbitrary scripts in the same execution context as app state or stored API keys

This isolation baseline is mandatory because the app stores local data and API keys in the same browser profile.

## Product Scope

### In Scope

- Installable PWA
- Local import of multiple `.epub` files
- Local bookshelf with cover, title, author, recent reading state, and progress
- Reading workspace with:
  - table of contents
  - reading progress
  - theme and typography controls
  - bookmarks
  - highlights
  - notes
- Selection popover actions:
  - translate
  - explain
  - highlight
  - add note
  - read aloud
- AI configuration via user-supplied API key stored locally in browser
- Continuous TTS from the current paragraph through the remainder of the current chapter, with pause, resume, and stop
- Local persistence for books, progress, annotations, settings, and provider configuration

### Out of Scope

- User accounts
- Cloud sync
- Backend proxy services
- Telemetry or analytics
- Social features
- Heavy library management such as advanced tagging or smart collections
- Full audiobook-style playback controls beyond core queue playback
- multiple AI providers in the initial shipped UI
- mobile-first layout optimization

## Product Principles

- Reading comes first. AI features must stay attached to the current reading context.
- The bookshelf should be lightweight. The reader workspace is the main product surface.
- Selection is the central entry point for translation, annotation, and instant TTS.
- Pure frontend is a hard requirement for this phase.
- The MVP should avoid speculative plugin systems or cross-device sync architecture.
- Scope decisions should prefer one working path over optionality.

## Primary User Experience

### 1. Bookshelf

The landing screen is a local bookshelf. Users can import EPUB files, see recently opened books, and reopen any book from saved progress. The bookshelf is intentionally light and should not feel like a full library manager.

### 2. Reading Workspace

The reading screen is a three-region workspace:

- Left rail: table of contents, bookmarks, highlights, and notes
- Center: reading surface with chapter content and top controls
- Right panel: AI results, note editing, and TTS session information

This layout is optimized for desktop reading and keeps contextual tools visible without navigating away from the book.

The top control bar includes a bookmark toggle for the current location. Bookmark creation is not hidden inside the text-selection popover.

### 3. Selection-Driven Actions

When users select text inside the EPUB content, a floating action popover appears with:

- Translate
- Explain
- Highlight
- Note
- Read aloud

The action result appears in the right-side panel without losing the current reading position. Note creation and note editing are both handled in the right panel for the MVP.

MVP selection support is intentionally limited to one contiguous selection range inside the currently rendered chapter document. Cross-chapter, cross-document, and multi-range selections are out of scope.

### 4. Continuous TTS

Users can start TTS from the current paragraph. The app extracts text from that paragraph through the end of the current chapter, chunks it into a playback queue, and plays it sequentially. The reading state remains aligned with the active chunk. The MVP player only needs play, pause, resume, and stop.

## Architecture Overview

The application uses a shell-plus-modules architecture:

- App shell owns routing, PWA installability, and top-level layout
- Feature modules own business behavior
- EPUB rendering is delegated to `epub.js`
- Business logic is isolated from rendering and provider-specific APIs

This keeps the MVP fast to build while preventing the rendering engine, UI state, and AI logic from becoming tightly coupled.

## Canonical Rendition Model

The MVP fixes one reading model instead of supporting multiple presentation modes:

- Desktop-first paginated reading mode
- One spine-item document rendered at a time in the active reading surface
- EPUB CFI is the canonical persisted location primitive for progress, annotations, bookmarks, and TTS anchors

Terminology in this spec follows these definitions:

- `current chapter`: the currently loaded spine-item document
- `current paragraph`: the paragraph block containing the current reading anchor inside the current spine-item document
- `visible range`: the portion of the current spine-item document visible in the active paginated view
- `selection`: one contiguous DOM range inside the current spine-item document

This means continuous TTS runs from the current paragraph to the end of the current spine-item document. Annotation replay is resolved against the current spine-item document. Cross-document selection is unsupported.

## AI Capability Baseline

The MVP ships with one validated provider profile in the UI, even though the internal design keeps an adapter boundary for future expansion.

The initial provider profile must support all of the following from a browser client:

- HTTPS API access with a user-supplied API key
- browser-compatible CORS behavior
- text generation for translation and explanation
- TTS generation returning playable audio data or a playable audio URL

The frozen MVP provider is OpenAI direct API access from the browser. The MVP must not ship a provider-selection UI in this phase.

Before broader implementation work begins, the team must complete a browser-only provider feasibility spike in Chromium. The spike passes only if it proves all of the following with the intended provider:

- a translation or explanation request succeeds directly from the browser with the user-supplied API key
- a TTS request succeeds directly from the browser and returns playable audio
- the returned audio can be attached to the MVP player path without a backend proxy
- expected auth, error, and CORS behavior are documented for the adapter contract

If any of these checks fail, AI translation, explanation, and TTS are removed from the MVP scope instead of adding a backend proxy or swapping to a different provider during this phase.

### Validated Provider Contract

Implementation targets this concrete provider contract:

- authentication: one user-supplied API key sent in an authorization header
- translation and explanation: OpenAI text generation endpoint, requested through a single adapter contract that accepts selected text plus local context metadata and returns plain text
- TTS: OpenAI `audio/speech` capability, requested through a single adapter contract that accepts plain text plus a chosen voice identifier and returns playable audio
- cancellation: all AI requests must support cancellation through the app request layer
- normalized errors:
  - auth error
  - quota or billing error
  - network or CORS error
  - unsupported capability
  - provider internal error

The feasibility spike only validates that this frozen provider contract works from the browser in the target environment.

## Major Modules

### App Shell

Responsible for:

- PWA bootstrapping
- route and screen selection
- layout chrome
- shared notifications and dialogs

### Bookshelf Module

Responsible for:

- importing EPUB files
- extracting metadata and cover
- listing books
- opening a selected book
- showing recent reading state

### Reader Module

Responsible for:

- wrapping `epub.js`
- opening a book
- moving between chapters and CFI locations
- exposing current selection and current reading position
- applying active reading preferences and shortcuts
- rendering and clearing visible annotation decorations inside the EPUB view

The reader module is the isolation boundary between the EPUB engine and the rest of the app.

### Annotation Module

Responsible for:

- highlights
- bookmarks
- notes
- binding annotations to stable EPUB locations using EPUB CFI anchors
- returning annotation records for a visible chapter or location range

The annotation module owns persistence and query logic. The reader module owns painting and clearing decorations in `epub.js` based on annotation records returned by the annotation module.

### AI Module

Responsible for:

- provider configuration
- translation requests
- explanation requests
- TTS requests
- normalized request and error handling across providers or provider profiles

The UI must never call provider APIs directly. It talks to a single app-level AI interface.

### Settings Module

Responsible for:

- API key entry
- translation target language preference
- reading preference persistence
- TTS preference persistence

The settings module owns persisted preference state. The reader and TTS playback layers consume already-resolved preferences at runtime.

## Storage Design

All persistent data is stored locally in `IndexedDB`.

For the MVP, imported books are stored as `Blob`s in `IndexedDB`. There is no fallback file-reference mode in this phase. This guarantees reopen-after-refresh behavior for supported books, at the cost of depending on browser storage quota.

### Persistent Data

- book metadata
- imported EPUB file blobs
- cover thumbnail cache
- reading progress per book
- last known CFI per book
- bookmarks
- highlights
- notes
- AI provider settings
- locally stored API key
- reading and TTS preferences

### Import and Duplicate Policy

- A successfully imported book is stored once as an EPUB blob plus extracted metadata
- Duplicate imports are detected by content hash or equivalent stable fingerprint
- Re-importing the same file updates recency and avoids duplicate bookshelf entries unless import is explicitly forced in a later phase
- Failed imports must not create partial bookshelf records
- Users can remove a book from the bookshelf, which deletes the stored EPUB blob, progress, bookmarks, highlights, and notes for that book

### Ephemeral Data

- selection popover state
- current translation panel result
- current explanation panel result
- active TTS queue
- request loading states
- transient error banners

Persistent state survives reloads. Ephemeral state is scoped to the current session or current screen interaction.

## Data Boundaries and Interfaces

### Reader Interface

The reader module should expose a narrow interface such as:

- open book
- get table of contents
- get current location
- go to location
- observe selection
- observe chapter changes
- extract text around a location
- render annotations for a visible range
- clear annotations for a visible range

It should not own annotation persistence or provider-specific AI behavior.

### Annotation Interface

The annotation module should expose:

- create highlight from selection range
- create bookmark at current location
- create note from selection range or location
- list annotations for current book
- query annotations that intersect a visible chapter or location range
- delete or update an existing annotation

Persisted annotation anchors use these shapes:

- bookmark: `{ id, bookId, spineItemId, cfi, createdAt }`
- highlight: `{ id, bookId, spineItemId, startCfi, endCfi, textQuote, color, createdAt, updatedAt }`
- note: `{ id, bookId, spineItemId, startCfi, endCfi, textQuote, body, createdAt, updatedAt }`

`spineItemId` identifies the active rendered document. `startCfi` and `endCfi` define the persisted range anchor. `textQuote` is stored only as a recovery aid for debugging and degraded replay, not as the canonical location primitive.

### AI Interface

The AI module should expose:

- `translateSelection(text, context)`
- `explainSelection(text, context)`
- `synthesizeSpeech(text, voiceOptions)`

Provider-specific request shapes stay inside adapters.

### TTS Orchestration Boundary

Continuous TTS is orchestrated by the reader-side playback controller, not by the AI adapter.

- Reader extracts text from the current paragraph to the end of the current chapter
- Reader-side playback controller slices that text into queue chunks and associates each chunk with source locations
- AI adapter only converts a provided text chunk into audio
- Playback controller advances through the queue and updates the active reading anchor

This keeps book content resolution in the reader boundary and speech synthesis in the AI boundary.

Instant selected-text read-aloud uses the same player surface and synthesis path as continuous TTS, but skips queue construction. Starting selection read-aloud interrupts any active continuous TTS session. Starting continuous TTS interrupts any active selection read-aloud session.

`current paragraph` is derived from the nearest readable block ancestor around the active reading anchor within the current spine-item document. The MVP block set is `p`, `li`, `blockquote`, `pre`, `td`, `h1` to `h6`, and fallback text-bearing `div`.

The active TTS session stops immediately when any of the following happen:

- user jumps through the table of contents
- user changes chapter or book manually
- user changes theme, font size, font family, line height, or other setting that causes layout reflow
- user starts another TTS mode

If synthesis or playback fails mid-queue, the controller exposes one retry action for the failed chunk and does not attempt automatic recovery across later chunks.

### Translation Behavior

- Source language is inferred by the selected text model
- Target language is configured in settings
- Default target language is the browser UI language on first launch
- Translation output should be concise and optimized for reading assistance rather than full literary rewriting
- When a newer selection replaces an in-flight translation or explanation request, the older request is canceled and its result is discarded

## Core Interaction Flows

### Flow 1: Selection to Translation or Explanation

1. User selects text inside the rendered EPUB content.
2. Reader normalizes the selection and resolves its location range.
3. A floating popover appears.
4. User chooses translate or explain.
5. The AI module sends the request through the selected provider adapter.
6. The right panel displays the result.
7. The reading position stays unchanged.

The same flow applies to Explain, with a response format optimized for concise definition or contextual explanation.

### Flow 2: Selection to Highlight or Note

1. User selects text.
2. Reader resolves the selection range to a stable location reference.
3. User chooses highlight or note.
4. Annotation module persists the new annotation immediately.
5. Reader requests visible annotations for the active chapter and repaints them through `epub.js` hooks.
6. Visible annotations are rehydrated when the chapter or book is reopened.

### Flow 2B: Current Location to Bookmark

1. User clicks the bookmark toggle in the top bar.
2. Reader resolves the current location to a stable bookmark location.
3. Annotation module persists the bookmark immediately.
4. Left-rail bookmark list updates for the active book.

### Flow 2C: Selection to Instant Read Aloud

1. User selects text inside the current chapter document.
2. Reader normalizes the single contiguous selection range.
3. User chooses Read aloud from the selection popover.
4. AI module synthesizes speech for the selected text through `synthesizeSpeech`.
5. Shared player starts playback and shows transient status in the right panel.
6. If another TTS mode is active, it is interrupted before playback begins.

### Flow 3: Current Position to Continuous TTS

1. User starts playback from the current paragraph.
2. Reader extracts text from the current paragraph through the end of the current chapter.
3. Text is chunked into queue items with location references.
4. AI module synthesizes audio for each chunk.
5. Player advances chunk by chunk.
6. Pause, resume, and stop keep the active reading anchor in sync.

Continuous TTS updates persisted reading progress when a new chunk starts and again when playback stops.

## Error Handling

The MVP only needs recoverable, user-facing error handling.

### EPUB Import Errors

- Detect corrupted or unsupported files
- Reject fixed-layout, DRM-protected, or otherwise unsupported EPUBs with a specific message
- Reject failed imports without polluting bookshelf state
- Show a clear import failure message

### Rendering or Location Errors

- If a saved location fails, fall back to chapter start or the last valid location
- Avoid blank-screen failure states
- If annotation replay for a saved location fails, keep the text visible and drop only the broken decoration

### Local Storage Errors

- If `IndexedDB` is unavailable at startup, block import and editing features and show a persistent local-storage warning
- If quota is exceeded during import, fail the import cleanly and keep existing data intact
- If a write fails for progress, notes, or settings, keep the in-memory session running and show a retryable warning
- If local state is corrupted, offer the user a per-book reset or full local reset instead of silent failure

### AI Request Errors

Differentiate at least:

- missing API key
- invalid API key
- quota or billing failure
- network or CORS failure
- provider-side error

These errors should be visible in both settings and the active AI interaction surface.

### TTS Playback Errors

- Stop the active queue safely
- Preserve the current reading position
- Allow retry from the current chunk or fallback to selection-only TTS
- If the configured provider profile does not support TTS, disable the continuous TTS entry point and explain why in settings

## Privacy and Security

- All data remains local in the browser
- API keys are stored locally only
- The settings screen must clearly state that AI requests are sent directly from the browser to the selected provider
- The settings screen must warn that browser-stored API keys are only protected by the local browser profile
- No cloud sync, account, or analytics collection is included in this phase
- Synthesized audio is ephemeral for MVP and is not persisted in `IndexedDB`

## Testing Strategy

### Unit Tests

- bookshelf storage behavior
- metadata and cover fallbacks for readable but incomplete EPUB files
- annotation storage and retrieval
- reading progress persistence
- AI adapter normalization
- TTS queue chunking and progression
- translation target-language preference resolution
- annotation-to-decoration mapping logic

### Integration Tests

- import EPUB and display metadata
- import a readable EPUB with missing cover or partial metadata and apply UI fallbacks
- open book and navigate table of contents
- restore progress after reload
- create and reopen a bookmark from the top bar
- create highlight and note from selection
- trigger translation from selection
- trigger explain from selection
- trigger instant read-aloud from selection
- start TTS from current location
- apply saved theme and typography settings
- install and relaunch as a PWA
- reject unsupported EPUB files gracefully
- surface storage quota or write failures without corrupting existing data
- block external book resources and require explicit open for external links

### End-to-End Smoke Tests

- import a sample EPUB
- open it from the bookshelf
- create one bookmark
- complete one translation action
- complete one explain action
- complete one selected-text read-aloud action
- complete one annotation action
- delete the imported book and verify local storage is reclaimed for that title
- reload and verify persistence
- install the app and verify it reopens into the bookshelf

## MVP Acceptance Criteria

- Users can import and reopen DRM-free reflowable EPUB 2 and EPUB 3 files
- Bookshelf data and reading progress persist after refresh
- Users can create highlights, bookmarks, and notes and see them again later
- Users can delete an imported book and remove its local data from the bookshelf
- Users can trigger translation within two interactions after selection
- Users can trigger explain within two interactions after selection
- Users can use instant read-aloud on selected text
- Users can start continuous TTS from the current paragraph and pause, resume, or stop playback
- Users can install the app as a PWA on supported desktop Chromium browsers
- Saved theme and typography preferences are restored when a book is reopened

## Recommended Technical Direction

For implementation planning, the recommended default stack is:

- modern frontend framework for app shell and UI
- `epub.js` for rendering and location handling
- `IndexedDB` for local persistence
- a service worker for PWA installability and caching
- a thin adapter layer for one validated browser-compatible AI provider profile

The exact framework choice can be finalized in implementation planning. This spec intentionally fixes behavior and boundaries before tool choice.

## Why This Scope Is Right

This scope is intentionally narrower than a full reading platform. It focuses on one coherent product: a desktop-first local EPUB reader with contextual AI assistance. The app can stand on its own without backend services, while keeping enough modularity to support future additions such as more providers or optional cloud sync.
