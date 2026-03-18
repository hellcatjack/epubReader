# EPUB Reader Width and Translation UI Design

**Date:** 2026-03-18

## Summary

This change aligns the visible text width between `scrolled` and `paginated` reading modes, and redesigns the right-side `Translation` panel so selected text, IPA, and translated content are easier to scan.

The goal is not to change reader behavior. It is a presentation refinement:

- `scrolled` should no longer feel wider than `paginated`
- the `Translation` panel should read like a compact dictionary/translation card instead of a stack of plain paragraphs

## Product Goal

The reading experience should feel visually consistent and easier to parse:

- switching reading modes should not radically change the perceived text measure
- translated content should be readable at a glance
- single-word translation metadata such as IPA should feel intentionally integrated rather than bolted on

## Scope

### In Scope

- make the visible text width in `scrolled` mode match the current `paginated` book-page width
- keep the existing centered book-page presentation
- redesign the `Translation` panel layout and hierarchy
- improve readability for:
  - selected text
  - IPA
  - translated content
  - explanation content

### Out of Scope

- changing reader routing
- changing TTS behavior
- changing translation or IPA data sources
- changing top bar, bookshelf, or left rail layouts

## Width Alignment

### Current Problem

`paginated` already uses a deliberately narrower book-page width, but `scrolled` still expands into a wider reading measure. This makes the mode switch feel like a layout jump instead of a reading preference.

### Target Behavior

Both modes should share the same effective book-page width:

- `paginated`: keep the current narrowed page width
- `scrolled`: adopt the same centered page width
- narrow screens should still fall back to full width when the constrained page would become too cramped

### Design Rule

The width rule should be mode-aware only where necessary. The preferred outcome is:

- one shared “reading page width” treatment for prose pages
- mode differences come from flow and pagination, not from a different text measure

## Translation Panel Redesign

### Current Problem

The panel currently renders:

- title
- selection line
- optional IPA line
- result paragraph

This works functionally, but the hierarchy is weak. Translation, IPA, and selected text compete visually and the panel reads like unstructured body copy.

### Target Structure

The panel should behave like a small reading-assistant card with three layers:

1. panel title
2. compact metadata cluster
3. primary result block

### Metadata Cluster

The metadata cluster should contain:

- `Selection`
- `IPA` when available

These should use smaller labels and quieter styling than the main translated content.

Recommended structure:

- a compact surface or inset block
- short uppercase labels
- slightly emphasized values

### Primary Result Block

The translated or explained content should sit inside its own larger content surface:

- more padding than the metadata cluster
- stronger contrast
- larger line height
- better white-space handling for multi-line explanation output

This makes the translation itself the visual destination.

## Visual Direction

The panel should stay consistent with the existing warm reading theme:

- paper-like neutral backgrounds
- subtle borders and shadows
- restrained accents rather than bright UI colors

The result should feel closer to a premium annotation card than a form or debug box.

## Architecture

This should stay within the existing reader surface:

- `reader.css` should own the width alignment and Translation card styling
- `AiResultPanel.tsx` should own the panel markup hierarchy
- `RightPanel.tsx` should remain mostly unchanged beyond passing props through

No new state model is required.

## Testing

The change should be covered at two levels:

### Component / Integration

- `AiResultPanel` renders metadata and main result in distinct sections
- IPA remains optional

### Browser

- `scrolled` and `paginated` prose widths stay aligned within a small tolerance
- Translation panel displays a visible metadata block and a distinct result block

## Risks

- changing width rules may affect how large-image pages feel in `scrolled`
- translation card styling must remain legible in `light`, `sepia`, and `dark`

## Recommendation

Implement this as a pure UI/layout pass:

- reuse the current narrowed prose width as the canonical reading width for both modes
- restructure `AiResultPanel` into metadata + result sections
- keep the rest of the reader architecture untouched

This gives a cleaner, more consistent reader without reopening the reading engine or tool logic.
