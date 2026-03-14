# EPUB Reader Local Windows TTS Helper Design

**Date:** 2026-03-13

## Summary

Add a thin Windows-only localhost TTS helper so the browser EPUB reader can use locally installed Windows natural voices and offline voice packs without sending book text to a remote service.

The reader stays a local-first PWA. TTS moves behind a loopback HTTP boundary implemented by a native Windows helper.

## Product Goal

The reader must support:

- selection-based read aloud
- continuous reading from the current reading position
- local Windows voices discovered from the user's system
- offline playback using installed system voice packs

## Scope

### In Scope

- Windows-only localhost TTS helper
- helper implemented with `.NET 8`
- helper listens on `127.0.0.1` only
- helper voice discovery via Windows native speech APIs
- reader integration for:
  - selected text playback
  - continuous reading from current location
  - pause / resume / stop
- reader settings for:
  - selected local voice
  - speech rate
  - speech volume
- helper health reporting
- visible error states when helper is unavailable or has no usable voices

### Out of Scope

- macOS or Linux TTS backends
- cloud TTS providers
- sentence-level karaoke highlighting
- cross-chapter uninterrupted background synthesis
- packaging the helper as a Windows installer in the first pass
- trying to control the Narrator app process directly

## Constraints

- The web app cannot directly call privileged Windows speech APIs from the browser.
- The helper must not expose itself to the LAN or internet.
- The helper must not persist book text or telemetry.
- The first version must work with currently installed Windows system voices or natural voices that are accessible through the Windows speech synthesis stack.

## Why A Localhost Helper

The browser app can already play audio blobs, but it cannot reliably enumerate and synthesize with Windows native voices at the fidelity and consistency required for desktop reading. A localhost helper creates a narrow boundary:

- reader owns reading state, text extraction, queueing, and playback UX
- helper owns voice enumeration and text-to-audio synthesis

This keeps the reader portable and makes the TTS backend replaceable later.

## Architecture

## Helper Application

The helper is a small `.NET 8` Windows process exposing loopback HTTP endpoints.

Responsibilities:

- verify that the helper is alive and ready
- enumerate voices currently available through Windows speech synthesis
- synthesize text into audio bytes
- return standard HTTP errors for unavailable voices or synthesis failures

The helper does not:

- store books
- store audio caches
- understand EPUB structure
- manage playback state

## Reader Integration Layer

The reader gets a dedicated local TTS client and queue manager.

Responsibilities:

- call the helper over `http://127.0.0.1:<port>`
- keep selected text playback separate from continuous reading playback
- split continuous reading into paragraph or sentence chunks
- request and play one chunk at a time
- stop playback when the user changes chapter or reading position

## Helper API

### `GET /health`

Returns:

- helper version
- backend readiness
- whether at least one local voice is available

Example response:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "backend": "windows-native",
  "voiceCount": 3
}
```

### `GET /voices`

Returns a normalized voice list:

- `id`
- `displayName`
- `locale`
- `gender`
- `isDefault`

Example response:

```json
[
  {
    "id": "Microsoft-Aria-Online-Natural",
    "displayName": "Microsoft Aria",
    "locale": "en-US",
    "gender": "female",
    "isDefault": true
  }
]
```

### `POST /speak`

Request body:

- `text`
- `voiceId`
- `rate`
- `volume`
- `format`

Example request:

```json
{
  "text": "Morgan pressed her head into the pillow.",
  "voiceId": "Microsoft-Aria-Online-Natural",
  "rate": 1.0,
  "volume": 1.0,
  "format": "wav"
}
```

Response:

- audio stream body
- `audio/wav` in the first version

## Reader Interaction Design

## Selection Read Aloud

- `Read aloud` remains in the selection action bar
- clicking it stops any currently playing TTS item
- the selected text is posted to `/speak`
- the returned blob is played through the existing browser audio path

## Continuous Reading

- a `TTS queue` panel is restored in the right rail
- controls:
  - `Start`
  - `Pause`
  - `Resume`
  - `Stop`
- starting continuous reading uses the current reading location, not chapter start
- the reader extracts visible chapter text from the current spine item, splits it into chunks, and feeds the helper sequentially
- when the user navigates to a different chapter or jumps to a bookmark, the queue stops and clears

## Chunking Strategy

The first version uses simple, stable chunking:

- prefer paragraph boundaries
- split oversized paragraphs by sentence
- enforce a safe max character budget per helper request

The reader should only synthesize:

- the current chunk
- optionally the next chunk as a small prefetch

This avoids sending an entire chapter to the helper at once.

## Settings Model Changes

The existing settings schema grows with local TTS fields:

- `ttsMode: "local-helper"`
- `ttsVoice: string`
- `ttsRate: number`
- `ttsVolume: number`
- `ttsHelperUrl: string`

Recommended defaults:

- `ttsMode: "local-helper"`
- `ttsVoice: "system-default"`
- `ttsRate: 1`
- `ttsVolume: 1`
- `ttsHelperUrl: "http://127.0.0.1:43115"`

## Error Handling

- helper offline:
  - show `Local TTS helper unavailable`
  - disable `Read aloud`, `Start`, and `Resume`
- no voices:
  - show `No local Windows voices detected`
- selected voice missing:
  - fall back to system default if available
  - otherwise show a blocking reader-side error
- synthesis error for one chunk:
  - continuous reading stops on that chunk
  - user may retry from the same point

## Security Boundary

- helper binds to `127.0.0.1` only
- helper rejects requests from non-loopback origins when possible
- no API key flow
- no text persistence
- no file system read access to EPUB files

## Testing Strategy

### Helper Tests

- unit tests for request validation
- unit tests for voice mapping
- integration tests for `/health`, `/voices`, `/speak`

### Reader Tests

- unit tests for local helper client normalization
- unit tests for queue state transitions
- unit tests for chunking from current location
- browser tests for:
  - selection read aloud
  - continuous reading start / pause / resume / stop
  - helper offline behavior

## Risks

- some Narrator-specific natural voices may not be accessible through the standard Windows speech synthesis APIs
- returned audio latency may be noticeable for very short selections if voice synthesis cold-start is slow
- continuous reading quality depends on stable text extraction from the rendered EPUB spine item

## Acceptance Criteria

- reader can list local Windows voices through the helper
- selected text can be spoken from the reader
- continuous reading starts from the current reading position
- pause / resume / stop work without losing queue state unexpectedly
- helper offline state is visible and recoverable
- no book text leaves the local machine
