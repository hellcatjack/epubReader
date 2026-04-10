# Scrolled Resize Anchor Stability Design

Date: 2026-04-10

## Goal

Stop reading-position drift in `scrolled mode` when the browser viewport is resized repeatedly, including Bible-style EPUBs that embed verse markers inside paragraph text.

## In Scope

- Fix scrolled resize anchor restoration in `epubRuntime.ts`.
- Fix scrolled resize follow-up recovery in `EpubViewport.tsx`.
- Add regression coverage for Bible-like inline marker content.
- Verify with browser repros against the ESV Bible EPUB and publish the updated frontend.

## Out Of Scope

- Reworking paginated mode again.
- Changing chapter navigation markup emitted by imported EPUBs.
- Redesigning stored reading-progress schemas.

## Problem

`scrolled mode` still drifted under repeated browser resize even after the earlier paginated fixes were stable.

The Bible repro made the failure mode obvious:

- open the ESV Bible EPUB
- use `GENESIS / Chapter 1`
- switch to `scrolled mode`
- scroll so verse 1 is the visible anchor
- repeatedly toggle between normal and larger browser sizes

Observed failures:

- resize sometimes restored to chapter navigation or the chapter heading instead of the visible verse paragraph
- later resizes could rewrite progress to a different visible passage
- verse markers embedded in the EPUB text made strict quote matching brittle

## Root Cause

There were two independent issues.

### 1. Runtime Anchor Resolution Was Too Fragile

The scrolled resize path depended on matching the saved `textQuote` back to a visible TTS block.

That broke for Bible content because:

- the saved quote is normalized text without inline verse-number markers
- the rendered paragraph still contains structural marker nodes
- strict exact-match recovery can therefore fail even when the correct paragraph is still present

The earlier coordinate conversion also treated scrolled block tops as if they still needed iframe/container offset adjustment, which is wrong for this reading surface.

### 2. Viewport Resize Recovery Was Too Mechanical

`EpubViewport.tsx` had a second scrolled resize fallback that rewrote `scrollTop` proportionally after resize.

That was a poor fit for semantic reading position:

- if runtime recovery already returned to the right paragraph, proportional fallback could still move the viewport
- if runtime recovery drifted to a different passage, proportional fallback had no notion of the last stable semantic anchor

## Design

### 1. Treat Scrolled Anchor Tops As Chapter Coordinates

Export a dedicated helper for scrolled anchor top resolution and keep it in chapter-document coordinates.

Result:

- the runtime no longer subtracts frame/container offsets a second time
- scrolled anchor restoration uses the paragraph's own document-space top

### 2. Add A Scrolled Resize Text-Matching Fallback

Introduce a scrolled-specific text-anchor lookup helper that tries:

- strict exact-match lookup first
- then strict contained-prefix lookup as a fallback

This preserves correctness for ordinary prose while recovering Bible paragraphs whose normalized saved quotes omit inline marker nodes.

### 3. Replace Proportional Viewport Rewrites With Semantic Recovery

Keep the relocation coalescing in `EpubViewport.tsx`, but change resize behavior so that:

- resize stores the last stable scrolled passage
- if relocation after resize stays on the same passage, do nothing
- if relocation after resize drifts to a different passage, call `goTo()` with the last stable `cfi`
- only if semantic recovery fails should the view fall back to raw `scrollTop`

This makes the recovery path passage-aware instead of scroll-ratio-aware.

## Test Strategy

Add focused regressions for both layers.

- `epubRuntime.test.ts`
  - scrolled anchor tops stay in chapter coordinates
  - scrolled resize anchor lookup can recover Bible-style paragraphs from truncated normalized quotes
- `EpubViewport.test.tsx`
  - resize does not trigger a redundant scrolled recovery when the passage is already stable
  - resize triggers semantic recovery when the passage drifts

## Success Criteria

- repeated scrolled resize does not drift to chapter headings or navigation
- repeated scrolled resize does not rewrite progress to a different visible passage
- Bible-style inline marker paragraphs can still be re-anchored correctly
- focused reader tests pass
- production build succeeds
- `dist/` is synced to `/app/epubReader/`
