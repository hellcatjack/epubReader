# TTS Background Translation Pause Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent continuous-TTS automatic translation requests while the reader document is hidden and resume once for the current spoken segment when it becomes visible.

**Architecture:** A focused React hook converts `document.visibilityState` and `visibilitychange` events into a boolean. `ReaderPage` includes that boolean in spoken-translation eligibility, reusing its existing empty-key reset, request-version invalidation, stable-segment cache, and note rendering behavior.

**Tech Stack:** React 19, TypeScript, Page Visibility API, Vitest, Testing Library

## Global Constraints

- Browser minimization and background-tab switching both count as hidden operation.
- Only automatic TTS translation pauses; continuous speech, queue advancement, EPUB highlighting, and wake-lock behavior remain unchanged.
- No translation request starts while `document.visibilityState === "hidden"`.
- A translation already in flight when the page becomes hidden cannot update the cache or UI.
- Foreground restoration processes only the latest current spoken segment and reuses the existing cache when available.
- Do not add dependencies or change the `AiService` interface.

---

## File Structure

- Create `src/features/reader/useDocumentVisibility.ts`: owns Page Visibility API subscription and exposes a boolean React hook.
- Create `src/features/reader/useDocumentVisibility.test.tsx`: verifies initial visibility, event updates, and listener cleanup.
- Modify `src/features/reader/ReaderPage.tsx`: gates spoken translation segment derivation with document visibility.
- Modify `src/features/reader/ReaderPage.test.tsx`: verifies hidden-page request suppression, foreground resumption, and stale-result invalidation.
- Modify `docs/tts-implementation.md`: documents the new automatic-translation lifecycle.

### Task 1: Page Visibility Hook

**Files:**
- Create: `src/features/reader/useDocumentVisibility.ts`
- Create: `src/features/reader/useDocumentVisibility.test.tsx`

**Interfaces:**
- Consumes: browser `Document.visibilityState`, `visibilitychange`, React `useEffect`, and React `useState`.
- Produces: `useDocumentVisibility(documentLike?: Document): boolean`; `true` means automatic translation may run.

- [x] **Step 1: Write the failing hook test**

Create a test that renders the hook against the jsdom document, changes its visibility state, dispatches `visibilitychange`, and verifies the returned boolean. Preserve and restore the original property descriptor so other tests remain isolated.

```tsx
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useDocumentVisibility } from "./useDocumentVisibility";

const originalVisibilityState = Object.getOwnPropertyDescriptor(document, "visibilityState");

function setDocumentVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
}

afterEach(() => {
  if (originalVisibilityState) {
    Object.defineProperty(document, "visibilityState", originalVisibilityState);
  } else {
    Reflect.deleteProperty(document, "visibilityState");
  }
});

it("tracks whether the document is visible", () => {
  setDocumentVisibility("visible");
  const { result } = renderHook(() => useDocumentVisibility());
  expect(result.current).toBe(true);

  act(() => {
    setDocumentVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(result.current).toBe(false);

  act(() => {
    setDocumentVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(result.current).toBe(true);
});
```

- [x] **Step 2: Run the hook test and verify RED**

Run: `npm test -- src/features/reader/useDocumentVisibility.test.tsx`

Expected: FAIL because `./useDocumentVisibility` does not exist.

- [x] **Step 3: Implement the hook**

Create the hook with a visible fallback when no document exists. Read once in the state initializer, synchronize again when the effect subscribes, and remove the exact listener on cleanup.

```ts
import { useEffect, useState } from "react";

function isVisible(documentLike: Document | undefined) {
  return !documentLike || documentLike.visibilityState !== "hidden";
}

export function useDocumentVisibility(
  documentLike = typeof document === "undefined" ? undefined : document,
) {
  const [documentVisible, setDocumentVisible] = useState(() => isVisible(documentLike));

  useEffect(() => {
    if (!documentLike) return undefined;

    const syncVisibility = () => setDocumentVisible(isVisible(documentLike));
    syncVisibility();
    documentLike.addEventListener("visibilitychange", syncVisibility);
    return () => documentLike.removeEventListener("visibilitychange", syncVisibility);
  }, [documentLike]);

  return documentVisible;
}
```

- [x] **Step 4: Run the hook test and verify GREEN**

Run: `npm test -- src/features/reader/useDocumentVisibility.test.tsx`

Expected: PASS with no React act warnings.

- [x] **Step 5: Commit the hook**

```bash
git add src/features/reader/useDocumentVisibility.ts src/features/reader/useDocumentVisibility.test.tsx
git commit -m "feat: track reader document visibility"
```

### Task 2: Gate TTS Automatic Translation

**Files:**
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/ReaderPage.test.tsx`

**Interfaces:**
- Consumes: `useDocumentVisibility(): boolean` from Task 1 and the existing `spokenSentenceTranslationRequestRef` request-version guard.
- Produces: no automatic translation calls while hidden; one current-segment cache lookup or request after visibility returns.

- [x] **Step 1: Add test visibility controls**

In `ReaderPage.test.tsx`, preserve the original descriptor, add a helper, and restore it from the existing `afterEach`.

```tsx
const originalDocumentVisibilityState = Object.getOwnPropertyDescriptor(document, "visibilityState");

function setDocumentVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}
```

The cleanup branch restores `originalDocumentVisibilityState` when present and otherwise deletes the test-owned property.

- [x] **Step 2: Write the hidden-playback integration test**

Reuse the continuous-TTS fixture shape from `does not repeat spoken segment translation while tts advances inside the same translation range`. Start visibly and assert one translation call. Set visibility to hidden, emit a speech boundary at the `because` token so playback enters a later stable translation segment, and assert the call count stays at one and the note is absent. Restore visible state and assert the second call contains `because`; dispatch another visible event and confirm the count remains two.

Key assertions:

```tsx
expect(ai.translateSelection).toHaveBeenCalledTimes(1);

act(() => {
  setDocumentVisibility("hidden");
  speech.emitBoundary(locatorText.indexOf("because"));
});

await waitFor(() => {
  expect(setActiveTtsSegment).toHaveBeenCalledWith(expect.objectContaining({ text: "because" }));
});
expect(ai.translateSelection).toHaveBeenCalledTimes(1);
expect(screen.queryByRole("status", { name: /spoken sentence translation/i })).not.toBeInTheDocument();

act(() => setDocumentVisibility("visible"));
await waitFor(() => expect(ai.translateSelection).toHaveBeenCalledTimes(2));
expect(ai.translateSelection.mock.calls[1]?.[0]).toContain("because");

act(() => setDocumentVisibility("visible"));
expect(ai.translateSelection).toHaveBeenCalledTimes(2);
```

- [x] **Step 3: Write the stale in-flight result test**

Start TTS with a deferred first translation. After the first request starts, hide the document, resolve the deferred promise, and verify no note is shown. Restore visibility and verify a second call translates the current segment and renders its result.

```tsx
const deferredTranslation = createDeferred<string>();
const ai = {
  explainSelection: vi.fn(async () => ""),
  translateSelection: vi
    .fn<AiService["translateSelection"]>()
    .mockImplementationOnce(() => deferredTranslation.promise)
    .mockResolvedValueOnce("恢复后的翻译"),
};

act(() => setDocumentVisibility("hidden"));
await act(async () => {
  deferredTranslation.resolve("后台过期翻译");
  await deferredTranslation.promise;
});
expect(screen.queryByText("后台过期翻译")).not.toBeInTheDocument();

act(() => setDocumentVisibility("visible"));
expect(await screen.findByText("恢复后的翻译")).toBeInTheDocument();
expect(ai.translateSelection).toHaveBeenCalledTimes(2);
```

- [x] **Step 4: Run the reader tests and verify RED**

Run: `npm test -- src/features/reader/ReaderPage.test.tsx -t "document is hidden|after the document becomes hidden"`

Expected: FAIL because `ReaderPage` continues deriving translation segments and calling `translateSelection` while hidden.

- [x] **Step 5: Gate spoken translation in ReaderPage**

Import and call the hook:

```tsx
import { useDocumentVisibility } from "./useDocumentVisibility";

const documentVisible = useDocumentVisibility();
```

Add `!documentVisible` to the early return in the `currentSpokenSentence` memo and include `documentVisible` in the dependencies:

```tsx
if (!documentVisible || !activeContinuousTtsSegment || ttsState.mode !== "continuous" || ttsState.status === "idle") {
  return "";
}
```

No translation-effect branch is added. Returning an empty spoken segment deliberately uses the existing reset path to increment `spokenSentenceTranslationRequestRef`, clear the note, and invalidate older promises.

- [x] **Step 6: Run focused tests and verify GREEN**

Run: `npm test -- src/features/reader/useDocumentVisibility.test.tsx src/features/reader/ReaderPage.test.tsx`

Expected: both files pass, including the existing stable-segment and setting-disable cases.

- [x] **Step 7: Commit reader behavior**

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/ReaderPage.test.tsx
git commit -m "fix: pause tts translation while hidden"
```

### Task 3: Document And Verify The Complete Change

**Files:**
- Modify: `docs/tts-implementation.md`

**Interfaces:**
- Consumes: final behavior from Tasks 1 and 2.
- Produces: maintainers can identify the visibility hook and understand hidden/visible translation behavior.

- [x] **Step 1: Update the implementation document**

Add `src/features/reader/useDocumentVisibility.ts` to the key-file table. Under `正在朗读片段的中文侧注`, add a `前后台切换` subsection documenting:

- hidden means minimized window or background tab according to Page Visibility API;
- only automatic translation pauses;
- hidden transition invalidates in-flight results and clears the note;
- TTS playback, marker advancement, and EPUB highlighting continue;
- visible transition derives only the latest segment and uses cache before requesting.

- [x] **Step 2: Run formatting and diff checks**

Run: `git diff --check`

Expected: exit code 0 with no output.

- [x] **Step 3: Run all unit tests**

Run: `npm test`

Expected: all Vitest files and tests pass.

- [x] **Step 4: Run the production build**

Run: `npm run build`

Expected: TypeScript checking and Vite production build pass. The repository's existing large-chunk warning is acceptable.

- [x] **Step 5: Commit documentation**

```bash
git add docs/tts-implementation.md docs/superpowers/plans/2026-08-11-tts-background-translation-pause.md
git commit -m "docs: explain background tts translation pause"
```

- [x] **Step 6: Inspect final scope**

Run: `git status --short && git log -4 --oneline && git diff HEAD~3 --stat`

Expected: clean worktree; commits are limited to the design, plan, visibility hook, reader behavior/tests, and TTS documentation.
