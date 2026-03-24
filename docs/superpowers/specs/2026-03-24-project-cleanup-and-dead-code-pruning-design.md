# Project Cleanup And Dead Code Pruning Design

Date: 2026-03-24

## Goal

Reduce maintenance surface by deleting product-inactive code paths and stale spike assets without removing active reader, settings, or deployment behavior.

## In Scope

- Remove the obsolete browser spike route and page used for early local OpenAI experimentation.
- Remove the corresponding feasibility note now that the product has a full AI provider system.
- Remove dead runtime helpers that are no longer imported anywhere.
- Collapse `EpubViewport` onto the single runtime-based production path by deleting the legacy `ReaderController` branch and its tests.
- Keep documentation focused on current product entry points and supported configuration flows.

## Out Of Scope

- Deleting historical design specs and implementation plans under `docs/superpowers/`.
- Reworking active settings shell components such as `SettingsPanel`.
- Changing AI provider behavior, TTS behavior, or deployment architecture.
- Removing helper projects that still provide supported development workflows, such as `helper/windows-tts-helper/`.

## Deletion Rules

Files are safe to remove only if they meet at least one of these conditions:

1. They are not imported by the product runtime and are not part of a supported operator workflow.
2. They represent an early spike that has been superseded by shipped product flows.
3. They keep a second implementation path alive when the product already relies on one stable path.

## Planned Cleanup Targets

### 1. Spike Artifacts

- `src/features/ai/OpenAISpikePage.tsx`
- `/spike/openai` route in `src/app/router.tsx`
- `docs/feasibility/openai-browser-spike.md`

These were useful during the earliest local-LLM feasibility pass, but they now duplicate shipped functionality and expose an extra route with no product value.

### 2. Dead Utility

- `src/features/tts/audioPlayer.ts`

This file has no runtime imports and only survives as historical scaffolding from an older TTS direction.

### 3. Legacy Viewport Path

- `src/features/reader/readerController.ts`
- `src/features/reader/readerController.test.ts`
- `controller` prop and controller-only branch inside `src/features/reader/EpubViewport.tsx`
- controller-specific tests in `src/features/reader/EpubViewport.test.tsx`

The current reader opens books through `epubViewportRuntime`. Keeping the older controller path increases code size and test surface while no product route uses it.

## Required Safeguards

- Add or update tests first so route removal and runtime-only viewport behavior are explicitly covered.
- Keep all current reader flows green after cleanup.
- Rebuild and redeploy the static app after code changes.

## Success Criteria

- No reachable `/spike/openai` product route remains.
- `EpubViewport` has a single runtime-based opening path.
- Unused files listed above are deleted.
- Tests, build, and deploy sync all succeed.
