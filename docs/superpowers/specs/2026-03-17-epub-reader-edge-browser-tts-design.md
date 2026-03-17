# EPUB Reader Edge Browser TTS Design

**Date:** 2026-03-17

## Summary

Replace the current localhost TTS service architecture with a browser-native TTS path built on `speechSynthesis` and optimized for `Microsoft Edge Desktop`.

This design intentionally stops relying on repository-hosted TTS services, helper URLs, and local audio generation processes. The reader will instead use the browser's built-in speech pipeline, with Edge online natural voices as the primary quality target.

The system will prioritize:

- fast first audible output without model warmup or local service startup
- high-quality English voices when running in desktop Edge with online voices available
- continuous reading that can progress through multiple paragraphs without stopping after the first item
- explicit degradation messaging outside the supported browser/runtime envelope

## Product Goal

The EPUB reader must support:

- `Read aloud` for selected text
- continuous reading from the current reading position
- `Pause / Resume / Stop`
- high-quality playback on desktop Edge
- no localhost TTS dependency

## Scope

### In Scope

- replace the current browser-to-localhost TTS contract with a browser-native TTS client
- define `Microsoft Edge Desktop` as the supported TTS platform
- support English-first voices with a curated shortlist and fallback selection logic
- keep existing reader controls:
  - `Read aloud`
  - `Start TTS`
  - `Pause TTS`
  - `Resume TTS`
  - `Stop TTS`
- queue continuous reading by paragraph-oriented text chunks
- persist browser-selected voice, rate, and volume in reader settings
- show explicit state and error messaging when the browser cannot provide the desired TTS quality

### Out of Scope

- localhost helper services
- server-side TTS generation
- front-end model inference
- permanent support guarantees for non-Edge browsers
- cloud API key management for third-party TTS services
- sentence-level karaoke highlighting

## Why Edge Browser TTS

The project no longer wants to operate or maintain a local TTS service, and the prior self-hosted paths did not meet the product requirement for fast startup with stable continuous playback.

`speechSynthesis` on desktop Edge is the most practical fit because:

- it removes model startup, GPU runtime, and local service management from the product
- it can access higher-quality online voices through the browser runtime
- it aligns with the user's acceptance of Edge-only support and network dependence
- it has the best chance of delivering sub-second to low-second first audio on an interactive reading action

This design optimizes for reader usability, not cross-browser uniformity.

## Constraints

- TTS is only guaranteed on `Microsoft Edge Desktop`
- network access is acceptable because high-quality online voices may be required
- non-Edge browsers must fail clearly rather than pretending to fully support the feature
- the design must remove the existing localhost helper dependency from the user-facing product flow

## Architecture

### High-Level Shape

The architecture becomes:

- browser reader UI
- browser-native TTS client
- browser-managed playback queue

There is no HTTP TTS backend in the active playback path.

### Recommended Architecture

Create a `browserTtsClient` that wraps:

- `window.speechSynthesis`
- `SpeechSynthesisUtterance`
- `speechSynthesis.getVoices()`
- `voiceschanged`

The client should expose a stable reader-facing API:

- `getVoices()`
- `speakSelection(text, options)`
- `startContinuous(segments, options)`
- `pause()`
- `resume()`
- `stop()`

The reader should not call `speechSynthesis` directly from page components. The wrapper must centralize:

- browser capability checks
- voice loading and filtering
- queue sequencing
- cancellation semantics
- browser-specific error handling

## Browser Support Strategy

### Supported

- `Microsoft Edge Desktop` with online voices available

### Degraded

- other Chromium browsers
- browsers that expose only low-quality or incomplete voices
- browsers where `speechSynthesis` exists but online voices are unavailable

In degraded environments the reader should surface:

- a clear support message
- the detected browser limitation
- a disabled or reduced-quality TTS state

The product should not silently fall back to a poor experience and still imply full support.

## Voice Strategy

The reader should not expose an uncontrolled full browser voice list by default.

Instead:

- prefer English voices first
- prefer voices with names or metadata that imply higher quality, such as `Natural`
- keep a curated shortlist of `2-4` recommended voices at the top
- allow fallback to another English voice if the preferred shortlist is unavailable

The first release should behave as though English reading quality is the primary TTS use case.

## Reader Data Flow

### Voice Discovery

1. reader initializes browser TTS client
2. client waits for initial voice availability and `voiceschanged` if needed
3. client returns filtered and ranked voices to settings UI
4. settings persist `voiceId`, `rate`, and `volume`

### Selection Read Aloud

1. user selects text
2. user clicks `Read aloud`
3. reader stops any current utterance
4. client creates one `SpeechSynthesisUtterance`
5. playback starts immediately using the selected voice and settings

### Continuous Reading

1. user clicks `Start TTS`
2. reader extracts text from the current reading position
3. reader splits text into paragraph-first segments
4. reader passes the segment list to the browser TTS client
5. client enqueues utterances one by one
6. each `onend` event advances to the next segment
7. `Pause / Resume / Stop` operate on the current browser queue state

If the reading position changes materially, the queue is discarded and rebuilt from the new location.

## Segmentation Strategy

Continuous reading should remain paragraph-first.

Rules:

- split by paragraph boundaries first
- merge very small adjacent paragraphs when reasonable
- split oversized paragraphs by sentence boundaries
- keep the first segment on the shorter side to reduce initial wait
- keep later segments somewhat larger to avoid over-fragmenting the queue

The queue should optimize for:

- fast first spoken output
- uninterrupted progression across multiple segments

## Settings Migration

The settings model should remove localhost-TTS-specific data from active use.

Required behavior:

- ignore legacy `ttsHelperUrl`
- stop rendering `TTS helper URL` controls
- preserve compatible values for:
  - `ttsVoice`
  - `ttsRate`
  - `ttsVolume`

If an old saved voice no longer exists in the current browser runtime, fall back to the first recommended voice.

## Error Handling

- browser unsupported:
  - show `TTS is optimized for Microsoft Edge on desktop`
- no suitable voices available:
  - show `No compatible Edge English voices detected`
- speech blocked until user action:
  - show a short prompt explaining that playback must start from a user interaction
- utterance error:
  - stop the queue
  - surface a retry action
- voice list not yet loaded:
  - show a loading state rather than an error

## Testing Strategy

### Unit Tests

- voice filtering and ranking
- segmentation logic compatibility with browser queueing
- settings migration away from `ttsHelperUrl`
- queue state transitions:
  - idle
  - loading voices
  - playing
  - paused
  - error

### Integration Tests

- settings page loads browser voices through the wrapper
- `Read aloud` creates an utterance with the expected voice, rate, and volume
- continuous reading advances across multiple queued segments
- stop and restart cancel the previous queue cleanly

### Browser Tests

- mock `speechSynthesis` rather than localhost HTTP endpoints
- verify:
  - supported Edge state
  - degraded unsupported-browser message
  - selection playback initiation
  - multi-segment continuous reading

## Acceptance Criteria

- on desktop Edge, selected text can be read aloud without any localhost TTS service running
- on desktop Edge, continuous reading can advance across multiple segments instead of stopping after the first one
- settings no longer expose `TTS helper URL`
- non-Edge environments display clear support guidance
- the active product flow contains no dependency on a repository-hosted TTS service
