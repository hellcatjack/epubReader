# EPUB Reader Kokoro Realtime TTS Design

**Date:** 2026-03-16

## Summary

Replace the current Qwen-based continuous reading path with a `Kokoro`-based local TTS service optimized for low-latency reading playback on the local `AMD AI Max+ 395 / Radeon 8060S` machine.

This design targets reader playback, not studio-grade offline rendering. The system will prioritize:

- first audible output in under `3s` after the user starts playback in a warmed state
- paragraph-oriented continuous reading
- unified backend for both selection read aloud and continuous reading
- a localhost HTTP interface that the existing browser reader can consume

The design intentionally drops Qwen as a TTS dependency for reader playback.

## Product Goal

The EPUB reader must support:

- selection read aloud through Kokoro
- continuous reading from the current reading position through Kokoro
- local synthesis on the Ubuntu host machine
- low-latency playback suited to interactive reading, not batch narration export

## Scope

### In Scope

- a local `Kokoro` service hosted on the Ubuntu machine
- AMD GPU-backed inference as the primary runtime path
- English-first voices, with interfaces that can expand to more languages later
- 2 to 4 curated English voices
- auto-prewarm on service startup
- paragraph-first chunking for continuous reading
- pre-generation of the next `1-2` reading segments before and during playback
- retaining the existing reader concepts:
  - `Read aloud`
  - `Start / Pause / Resume / Stop`

### Out of Scope

- retaining Qwen as an active playback backend
- voice cloning
- cloud TTS as part of the first Kokoro rollout
- sentence-level karaoke highlighting
- chapter-wide full pre-render before playback
- true token-level or phoneme-level audio streaming in the first pass

## Why Kokoro

The current Qwen path is not a good fit for interactive reading latency. It favors full generation and has poor responsiveness when the reader issues many small requests.

`Kokoro` is a better fit for this product goal because:

- it is materially smaller and faster than Qwen-style TTS stacks
- its official usage pattern is generator-oriented, which fits incremental reading playback better
- it is suitable for a localhost service that stays warm and produces short-to-medium reading segments quickly

The objective is not maximum expressiveness. The objective is a reading experience that feels responsive enough to use as a primary reader control.

## Constraints

- the user has explicitly dropped Qwen from the playback architecture
- continuous reading may pre-generate `1-2` paragraphs, but playback start must still feel responsive
- first audible output must target `< 3s` in a warmed state
- the service should use the local AMD GPU as its primary inference device
- both selection read aloud and continuous reading must use Kokoro

## Architecture

### High-Level Shape

The system keeps the same broad split:

- browser reader UI
- localhost TTS service
- browser-side playback queue

What changes is the synthesis engine and the chunking strategy.

### Recommended Architecture

Use a paragraph-oriented pre-generation queue rather than true low-level streaming.

Flow:

1. user starts `Read aloud` or `Start TTS`
2. reader extracts text from the current selection or reading position
3. reader turns text into paragraph-first segments
4. service pre-generates segment `1` and segment `2`
5. as soon as segment `1` returns, playback begins
6. while segment `1` plays, the service generates segment `3`
7. the reader always tries to keep `1` future segment ready, with `2` as the practical max

This is intentionally not a WebSocket-first design. It is the lowest-risk architecture that still aligns with the user's real-time requirements.

## Service API

### `GET /health`

Returns:

- service status
- backend name
- version
- whether the model is warmed
- current device
- voice count

Example:

```json
{
  "status": "ok",
  "backend": "kokoro",
  "version": "0.1.0",
  "warmed": true,
  "device": "cuda:0",
  "voiceCount": 4
}
```

### `GET /voices`

Returns a curated list of `2-4` English voices for the first version:

- `id`
- `displayName`
- `locale`
- `gender`
- `isDefault`

The reader settings page consumes this list. The reader should not expose a raw unbounded catalog in the first pass.

### `POST /prewarm`

Runs a tiny warmup generation using a fixed short internal string.

Purpose:

- move model initialization and first-kernel cost out of the user's first playback action
- make `< 3s` startup realistic after service start

The service should also run this automatically on startup, but the explicit endpoint is still useful for diagnostics and rewarm.

### `POST /speak`

Request body:

- `text`
- `voiceId`
- `rate`
- `volume`
- `format`

Response:

- complete wav blob for one segment

This endpoint is used by:

- selection read aloud
- one segment of continuous reading

The first version does not require `/speak-stream`.

## Reader Data Flow

### Selection Read Aloud

1. user selects text
2. clicks `Read aloud`
3. reader calls `POST /speak`
4. returned wav is played immediately

This is the simplest path and should remain low complexity.

### Continuous Reading

1. user clicks `Start TTS`
2. reader extracts readable text from the current location
3. text is segmented with paragraph-first rules
4. reader requests segment `1` and segment `2`
5. once segment `1` returns, playback starts
6. segment `3` is requested while segment `1` is playing
7. pause/resume/stop operate on the current queue state

If the reading position changes materially, the queue is invalidated and must restart from the new location.

## Segmentation Strategy

The current sentence-heavy strategy is not appropriate for Kokoro-backed continuous reading.

The new strategy should be:

- split by paragraph first
- collapse whitespace
- if a paragraph is too short, merge with the next paragraph when reasonable
- if a paragraph is too long, split inside it on sentence boundaries
- avoid one-request-per-sentence except as a fallback for oversized paragraphs

Target first-pass sizing:

- aim for roughly `250-500` English characters per segment
- keep the first segment biased toward the smaller end for faster initial sound
- allow later segments to be slightly larger for smoother continuity

This design intentionally separates:

- startup latency optimization
- continuity optimization

The first segment should optimize for start time. Later segments should optimize for fewer gaps.

## Voice Strategy

The first release should expose a small, intentional voice set:

- one default English voice
- 1 to 3 alternates

Do not expose a giant voice list by default. The goal is stable latency and predictable quality, not maximal surface area.

English is the first-class path. The API may keep room for multilingual expansion later, but multilingual tuning is not required for the first release.

## Error Handling

- service offline:
  - reader shows `Local Kokoro service unavailable`
- model warming:
  - UI shows `warming_up`
  - playback controls that require synthesis remain blocked or clearly pending
- unsupported voice:
  - return `400`
- empty text:
  - return `400`
- synthesis failure:
  - return `500`
  - reader surface should show a short actionable error
- queue underrun:
  - UI should show `generating next segment` rather than a generic error

## Performance Strategy

To make `< 3s` startup realistic:

- keep the model loaded
- warm at startup
- pre-generate the first two segments for continuous reading
- keep only a small lookahead window to avoid saturating the GPU unnecessarily
- avoid over-splitting into sentence-sized micro-requests

This architecture accepts a practical truth:

- true streaming playback is more complex than needed for this phase
- what the user actually needs is low startup latency and acceptable inter-segment continuity

## Acceptance Criteria

### Warmed Selection Playback

- after the service is warmed, selection read aloud should begin audible playback in `< 3s`

### Warmed Continuous Playback

- after the service is warmed, continuous reading should begin audible playback in `< 3s`
- in a normal English novel passage, segment gaps should aim to stay within about `<= 1s`

### Stability

- `Start / Pause / Resume / Stop` work reliably
- changing reading position stops and invalidates the previous queue
- voice selection persists in local settings

### Visibility

The UI should distinguish:

- `warming_up`
- `generating next segment`
- `playing`
- `paused`
- `error`

## Testing Strategy

### Service Tests

- `GET /health`
- `GET /voices`
- `POST /prewarm`
- `POST /speak`
- request validation for empty text and unsupported voices

### Reader Tests

- selection read aloud triggers Kokoro `/speak`
- continuous reading enqueues the first two segments
- position change cancels the old queue
- status panel reflects warming, generating, and playing states

### Performance Checks

Manual validation on the target machine must record:

- warmed selection playback startup latency
- warmed continuous playback startup latency
- gap duration between segment `1` and segment `2`

If the system misses the latency target, the next adjustment is:

- smaller first segment
- more aggressive startup prewarm
- tuned lookahead window

not a return to Qwen.

## Migration Notes

The current Qwen service path should be treated as deprecated for playback.

Migration should preserve the reader-side contract where practical so the frontend changes stay focused on:

- status wording
- segmentation
- queue behavior
- voice handling

The backend engine changes completely, but the product surface should remain familiar to the user.
