# TTS Background Translation Pause Design

## Goal

Pause TTS automatic translation while the reader document is hidden, including when the browser window is minimized or the user switches to another tab. Continuous TTS playback, queue progress, and EPUB text highlighting must continue. When the document becomes visible again, translation resumes from the current spoken segment.

## Scope

This change applies only when continuous TTS and the TTS translation note setting are active.

- Treat `document.visibilityState === "hidden"` as background operation.
- Stop starting automatic translation requests while hidden.
- Ignore results from requests that were already in flight when the document became hidden.
- Clear the visible TTS translation note while hidden.
- Resume from the latest TTS marker when the document becomes visible.
- Reuse the existing in-memory translation cache whenever possible.
- Keep speech playback, queue advancement, wake-lock behavior, and text highlighting unchanged.

## Architecture

Add a small page-visibility hook that converts the Page Visibility API into React state. `ReaderPage` will use this state as an eligibility condition for spoken-segment translation.

The existing translation effect already uses a monotonically increasing request version. Making the current spoken translation segment empty while hidden routes the transition through the existing reset path, which increments that version and clears the rendered translation. Any older promise may finish, but its result cannot update the cache or UI because its version is stale.

No cancellation contract is added to `AiService`. The current translation adapters do not expose a shared abort interface, and stale-result invalidation is sufficient to prevent hidden-page work from affecting reader state. Most resource savings come from suppressing all subsequent segment requests while the page remains hidden.

## Data Flow

Visible playback:

```text
TTS marker update
  -> derive stable translation segment
  -> build cache key
  -> cache hit or one translation request
  -> render translation note
```

Transition to hidden:

```text
visibilitychange(hidden)
  -> page-visible state becomes false
  -> spoken translation segment becomes empty
  -> invalidate request version
  -> clear translation note
  -> later TTS marker updates cannot start translation requests
```

Transition back to visible:

```text
visibilitychange(visible)
  -> page-visible state becomes true
  -> derive segment from latest TTS marker
  -> reuse cache or request that current segment once
```

## Component Boundaries

### Page visibility hook

The hook owns:

- reading the initial `document.visibilityState`;
- subscribing to and removing the `visibilitychange` listener;
- treating environments without `document` as visible so server-side or test rendering does not fail.

It does not own TTS or translation behavior.

### ReaderPage

`ReaderPage` owns the policy that automatic TTS translation is eligible only while the document is visible. It continues to use the existing stable-segment extraction, cache key, request version, and translation note rendering paths.

## Error And Race Handling

- A translation promise resolving after the page becomes hidden is ignored through the request-version guard.
- Repeated hidden events do not trigger translation calls.
- Repeated visible events do not trigger duplicate calls when the segment and cache key have not changed.
- If TTS advances through several segments while hidden, only the segment active at foreground restoration is considered.
- Translation failures remain quiet and leave the note empty, matching existing behavior.

## Testing

Add focused coverage for:

1. TTS starts visibly and translates the first segment once.
2. The document becomes hidden and TTS advances into another stable translation segment without another translation request.
3. The document becomes visible and exactly one request is made for the latest current segment.
4. An in-flight translation resolved after hiding cannot display a stale note.

Run the focused reader tests, the complete unit test suite, and the production build.

## Documentation

Update `docs/tts-implementation.md` to describe Page Visibility behavior, hidden-page request suppression, stale-result handling, and foreground resumption.
