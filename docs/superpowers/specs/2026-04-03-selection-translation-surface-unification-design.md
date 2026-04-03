# Selection Translation Surface Unification Design

## Goal

Make selection translation behavior consistent across wide and tablet layouts:

- single-word selections keep using the right-side `Reading assistant`
- multi-word, phrase, sentence, and paragraph selections stop using `Reading assistant`
- multi-word+ selections always use the floating translation bubble
- the bubble only shows Chinese translation and stays visible until user interaction changes reading context

## Current Problem

The current behavior is split by layout instead of selection intent:

- wide screens show translation in `Reading assistant`
- tablet mode shows a temporary floating bubble
- the bubble auto-dismisses on a timer
- right-side translation can keep stale content when a new multi-word selection happens

This makes the same selection behave differently depending on viewport width and leaves stale translation visible in the right rail.

## Recommended Design

### Selection classification

Use the existing word eligibility logic:

- if the selection is a single eligible word, treat it as `word`
- otherwise treat it as `multi`

`word` keeps the current assistant-driven behavior.

`multi` gets a dedicated floating translation bubble regardless of viewport width.

### Reading assistant behavior

For `word` selections:

- keep `Selection`
- keep `IPA`
- keep `Translation`

For `multi` selections:

- immediately clear `translation`
- immediately clear `aiIpa`
- leave the assistant in placeholder/default state

This avoids ambiguity from stale single-word translations.

### Floating bubble behavior

For `multi` selections:

- show the floating bubble on both wide and tablet layouts
- only render the translated Chinese text
- do not render original selected text
- do not auto-dismiss on a timer

### Bubble dismissal triggers

Dismiss the bubble whenever reading context changes, including:

- pointer or mouse click
- scroll
- page turn
- TOC navigation
- reading mode switch
- a new selection drag starting
- selection cleared

## Architecture Notes

The existing `SelectionTranslationBubble` should be simplified from a mixed “original + translation” popover into a translation-only surface.

`ReaderPage` should own the policy:

- classify selection as `word` or `multi`
- decide whether assistant translation state should be updated or cleared
- decide when the bubble is created and cleared

The existing tablet-specific bubble logic should be replaced by a layout-agnostic `multi` selection flow.

## Testing

Add coverage for:

- single-word selection still updates `Reading assistant`
- multi-word selection clears stale assistant translation and IPA
- multi-word selection shows bubble on wide screens
- multi-word selection shows bubble on tablet screens
- bubble does not auto-dismiss after timeout
- click, scroll, page turn, and new selection start dismiss the bubble
