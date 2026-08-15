# OpenAI-Compatible Authentication And Reasoning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser-local Bearer Token authentication, authenticated model selection, and configurable Explain reasoning effort for OpenAI-compatible endpoints.

**Architecture:** Extend the existing local/OpenAI-compatible adapter rather than adding another provider. Persist normal and Grammar tokens separately, pass them through AiService to request and model-discovery boundaries, and keep reasoning effort scoped to Grammar Explain requests.

**Tech Stack:** React 19, TypeScript, Fetch API, IndexedDB/Dexie, Vitest, Testing Library

## Global Constraints

- Accept `/v1`, `/chat/completions`, and `/completions` endpoint forms.
- Never hardcode `https://ushome.amycat.com/openai/v1` or a user token.
- Never send `Authorization` when the token is blank.
- Store tokens only in the existing browser-local settings and refresh snapshot.
- Reasoning choices are exactly `default`, `low`, `medium`, and `high`.
- Non-default reasoning sends `reasoning_effort` and omits `chat_template_kwargs`.
- Default reasoning preserves `chat_template_kwargs.enable_thinking = false`.
- Model discovery waits 400 ms after endpoint/token changes and aborts stale requests.
- Gemini behavior and unauthenticated localhost behavior remain unchanged.
- No new runtime dependency is introduced.

---

## File Structure

- Modify `src/lib/types/settings.ts`: define `LlmReasoningEffort` and persisted fields.
- Modify `src/features/settings/settingsRepository.ts`: defaults and legacy migration detection.
- Modify `src/features/settings/settingsRepository.test.ts`: persistence and migration coverage.
- Modify `src/features/ai/openaiAdapter.ts`: Bearer headers and Explain reasoning payload.
- Modify `src/features/ai/openaiAdapter.test.ts`: request-level authentication and reasoning coverage.
- Modify `src/features/ai/aiService.ts`: normal/Grammar token routing and fallback.
- Modify `src/features/ai/aiService.test.ts`: adapter-configuration routing coverage.
- Modify `src/features/ai/localModelDiscovery.ts`: authenticated `/models` request and access error.
- Modify `src/features/ai/localModelDiscovery.test.ts`: header, URL, and error coverage.
- Modify `src/features/ai/useLocalLlmModels.ts`: token-aware debounced discovery.
- Create `src/features/ai/useLocalLlmModels.test.tsx`: hook timing and stale-request coverage.
- Modify `src/features/ai/providerOptions.ts`: reasoning-effort select options.
- Modify `src/features/settings/SettingsDialog.tsx`: token and reasoning controls.
- Modify `src/features/settings/settingsDialog.test.tsx`: full settings persistence coverage.
- Modify `src/features/reader/panels/AppearancePanel.tsx`: in-reader controls and authenticated model discovery.
- Modify `src/features/reader/panels/AppearancePanel.test.tsx`: control rendering and callbacks.
- Modify `src/features/reader/RightPanel.tsx`: pass new settings props and callbacks.
- Modify `src/features/reader/ReaderPage.tsx`: persist in-reader token/reasoning changes.
- Modify `src/features/reader/ReaderPage.test.tsx`: integration coverage for new handlers.
- Create `docs/openai-compatible-api.md`: configuration and compatibility documentation.
- Modify `docs/README.md`: link the new document.

### Task 1: Persist Authentication And Reasoning Settings

**Files:**
- Modify: `src/lib/types/settings.ts`
- Modify: `src/features/settings/settingsRepository.ts`
- Test: `src/features/settings/settingsRepository.test.ts`

**Interfaces:**
- Produces: `LlmReasoningEffort`, `llmApiKey`, `grammarLlmApiKey`, and `grammarLlmReasoningEffort` on `SettingsInput`.

- [ ] **Step 1: Write failing settings tests**

Add tests that prove defaults are safe and a legacy record is migrated with the new fields:

```ts
expect(defaultSettings).toMatchObject({
  grammarLlmApiKey: "",
  grammarLlmReasoningEffort: "default",
  llmApiKey: "",
});

await db.settings.put({
  ...legacySettings,
  id: "settings",
} as SettingsRecord);

await expect(getSettings()).resolves.toMatchObject({
  grammarLlmApiKey: "",
  grammarLlmReasoningEffort: "default",
  llmApiKey: "",
});
```

Add a save/read assertion using non-empty token values and `"high"` reasoning effort.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/features/settings/settingsRepository.test.ts`

Expected: FAIL because the settings type/defaults do not contain the new fields.

- [ ] **Step 3: Implement settings fields and migration detection**

Add:

```ts
export type LlmReasoningEffort = "default" | "low" | "medium" | "high";

llmApiKey: string;
grammarLlmApiKey: string;
grammarLlmReasoningEffort: LlmReasoningEffort;
```

Use empty strings and `"default"` in `createDefaultSettings()`. Extend `isLegacySettingsRecord()` to require both token strings and a recognized reasoning value. Normalize an invalid migrated reasoning value back to `defaultSettings.grammarLlmReasoningEffort`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- src/features/settings/settingsRepository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/settings.ts src/features/settings/settingsRepository.ts src/features/settings/settingsRepository.test.ts
git commit -m "feat: persist openai-compatible auth settings"
```

### Task 2: Authenticate AI Requests And Configure Explain Reasoning

**Files:**
- Modify: `src/features/ai/openaiAdapter.ts`
- Modify: `src/features/ai/openaiAdapter.test.ts`
- Modify: `src/features/ai/aiService.ts`
- Modify: `src/features/ai/aiService.test.ts`

**Interfaces:**
- Consumes: `LlmReasoningEffort` and settings fields from Task 1.
- Produces: `createOpenAIAdapter({ apiKey?, reasoningEffort? })` with authenticated requests.

- [ ] **Step 1: Write failing adapter tests**

Create an adapter with a whitespace-padded token and `reasoningEffort: "high"`. Exercise translation, Explain, and definition with successful fake responses. Assert every request contains:

```ts
headers: {
  Authorization: "Bearer reader-secret",
  "Content-Type": "application/json",
}
```

Assert only the Explain payload contains:

```ts
expect(explainBody.reasoning_effort).toBe("high");
expect(explainBody.chat_template_kwargs).toBeUndefined();
```

Retain the existing default test and assert it has no Authorization header, omits `reasoning_effort`, and contains `{ enable_thinking: false }`.

- [ ] **Step 2: Write failing AiService routing tests**

For normal local translation, expect:

```ts
expect(createLocalAdapter).toHaveBeenCalledWith({
  apiKey: "translation-token",
  endpoint: "https://example.test/openai/v1",
  textModel: "translation-model",
});
```

For Grammar Explain, configure only Grammar token/model/reasoning while leaving Grammar URL blank. Assert endpoint falls back to `llmApiUrl` and the adapter receives:

```ts
{
  apiKey: "grammar-token",
  endpoint: "https://example.test/openai/v1",
  reasoningEffort: "high",
  textModel: "grammar-model",
}
```

Also cover blank Grammar token/model inheriting `llmApiKey` and `localLlmModel`.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm test -- src/features/ai/openaiAdapter.test.ts src/features/ai/aiService.test.ts`

Expected: FAIL because adapter options, Authorization headers, reasoning payload, and fallback routing are absent.

- [ ] **Step 4: Implement request authentication and reasoning**

Add one shared header builder:

```ts
function createJsonHeaders(apiKey: string) {
  const token = apiKey.trim();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
```

Thread `apiKey` through completion, chat, Explain, and definition requests. Build the Explain extras as:

```ts
const reasoningOptions =
  reasoningEffort === "default"
    ? { chat_template_kwargs: { enable_thinking: false } }
    : { reasoning_effort: reasoningEffort };
```

In `AiService`, trim settings and use Grammar values with normal local values as field-by-field fallbacks. Treat a non-default Grammar reasoning effort as a Grammar override. Keep Gemini routing when no Grammar override exists.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- src/features/ai/openaiAdapter.test.ts src/features/ai/aiService.test.ts`

Expected: PASS, including existing Gemini tests.

- [ ] **Step 6: Commit**

```bash
git add src/features/ai/openaiAdapter.ts src/features/ai/openaiAdapter.test.ts src/features/ai/aiService.ts src/features/ai/aiService.test.ts
git commit -m "feat: authenticate openai-compatible ai requests"
```

### Task 3: Authenticate And Debounce Model Discovery

**Files:**
- Modify: `src/features/ai/localModelDiscovery.ts`
- Modify: `src/features/ai/localModelDiscovery.test.ts`
- Modify: `src/features/ai/useLocalLlmModels.ts`
- Create: `src/features/ai/useLocalLlmModels.test.tsx`

**Interfaces:**
- Produces: `listLocalModels(endpoint, { apiKey?, fetch?, signal? })` and `useLocalLlmModels(endpoint, { apiKey?, enabled? })`.

- [ ] **Step 1: Write failing model-discovery tests**

Update the existing success test to call:

```ts
listLocalModels("https://ushome.amycat.com/openai/v1", {
  apiKey: " model-token ",
  fetch: fakeFetch,
})
```

Assert `GET https://ushome.amycat.com/openai/v1/models` with `Authorization: Bearer model-token`. Add a blank-token test that expects no Authorization header and a `401`/`403` test that rejects with a typed access error without exposing the response body.

- [ ] **Step 2: Write failing hook tests**

Use fake timers and a stubbed global fetch:

```tsx
vi.useFakeTimers();
const { rerender, result } = renderHook(
  ({ apiKey }) => useLocalLlmModels("https://example.test/v1", { apiKey }),
  { initialProps: { apiKey: "first" } },
);

expect(fetch).not.toHaveBeenCalled();
await act(async () => vi.advanceTimersByTimeAsync(400));
expect(fetch).toHaveBeenCalledTimes(1);

rerender({ apiKey: "second" });
await act(async () => vi.advanceTimersByTimeAsync(399));
expect(fetch).toHaveBeenCalledTimes(1);
await act(async () => vi.advanceTimersByTimeAsync(1));
expect(fetch).toHaveBeenCalledTimes(2);
expect(result.current.status).toBe("ready");
```

Add an access-error assertion for the user-facing message without token contents.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- src/features/ai/localModelDiscovery.test.ts src/features/ai/useLocalLlmModels.test.tsx`

Expected: FAIL because discovery cannot authenticate and the hook has no debounce/token options.

- [ ] **Step 4: Implement authenticated discovery and debounce**

Add options and an access error:

```ts
type ListLocalModelsOptions = {
  apiKey?: string;
  fetch?: FetchLike;
  signal?: AbortSignal;
};

export class LocalModelDiscoveryAccessError extends Error {}
```

Send Bearer auth only for a non-empty token. Convert `401` and `403` into `LocalModelDiscoveryAccessError`.

In the hook, wait 400 ms, create an `AbortController`, call `listLocalModels`, and on cleanup clear the timer and abort. Ignore `AbortError`. Return messages for ready/access/error/blocked states without including tokens.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test -- src/features/ai/localModelDiscovery.test.ts src/features/ai/useLocalLlmModels.test.tsx`

Expected: PASS with no act warnings or pending timers.

- [ ] **Step 6: Commit**

```bash
git add src/features/ai/localModelDiscovery.ts src/features/ai/localModelDiscovery.test.ts src/features/ai/useLocalLlmModels.ts src/features/ai/useLocalLlmModels.test.tsx
git commit -m "feat: authenticate openai-compatible model discovery"
```

### Task 4: Add Token And Reasoning Controls

**Files:**
- Modify: `src/features/ai/providerOptions.ts`
- Modify: `src/features/settings/SettingsDialog.tsx`
- Modify: `src/features/settings/settingsDialog.test.tsx`
- Modify: `src/features/reader/panels/AppearancePanel.tsx`
- Modify: `src/features/reader/panels/AppearancePanel.test.tsx`
- Modify: `src/features/reader/RightPanel.tsx`
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/ReaderPage.test.tsx`

**Interfaces:**
- Consumes: settings and authenticated discovery from Tasks 1 and 3.
- Produces: editable normal/Grammar tokens and Grammar reasoning effort on both settings surfaces.

- [ ] **Step 1: Write failing component tests**

In `settingsDialog.test.tsx`, store non-empty token/reasoning values, render the dialog, and assert password inputs and select values:

```tsx
expect(screen.getByLabelText("LLM API Token")).toHaveValue("translation-token");
expect(screen.getByLabelText("Grammar LLM API Token")).toHaveValue("grammar-token");
expect(screen.getByLabelText("Grammar reasoning effort")).toHaveValue("high");
```

Change them, save, and assert `getSettings()` contains the new values.

In `AppearancePanel.test.tsx`, render with the three values and spies, then assert the controls render and each change callback receives the selected value.

In `ReaderPage.test.tsx`, exercise the in-reader controls and assert the settings repository stores the new values.

- [ ] **Step 2: Run component tests and verify RED**

Run: `npm test -- src/features/settings/settingsDialog.test.tsx src/features/reader/panels/AppearancePanel.test.tsx src/features/reader/ReaderPage.test.tsx -t "API Token|reasoning effort"`

Expected: FAIL because the controls and props do not exist.

- [ ] **Step 3: Implement shared options and SettingsDialog controls**

Export:

```ts
export const llmReasoningEffortOptions: Array<{ label: string; value: LlmReasoningEffort }> = [
  { label: "Default", value: "default" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];
```

Pass `llmApiKey` and `grammarLlmApiKey || llmApiKey` to the two model-discovery hooks. Add password inputs after their endpoints and a select after the Grammar model. Do not render token values in summaries or status text.

- [ ] **Step 4: Implement reader settings props and handlers**

Add values and callbacks through `AppearancePanel` and `RightPanel`, then add `ReaderPage` handlers:

```ts
await updateSettings({ llmApiKey });
await updateSettings({ grammarLlmApiKey });
await updateSettings({ grammarLlmReasoningEffort });
```

Use `type="password"`, `autoComplete="off"`, and the same option list as SettingsDialog.

- [ ] **Step 5: Run component tests and verify GREEN**

Run: `npm test -- src/features/settings/settingsDialog.test.tsx src/features/reader/panels/AppearancePanel.test.tsx src/features/reader/ReaderPage.test.tsx`

Expected: PASS, including existing model-discovery fallback behavior.

- [ ] **Step 6: Run React quality review**

Use the `vercel:react-best-practices` skill to review hook dependencies, prop threading, controlled fields, and avoid unnecessary rerenders or token leakage. Apply only findings relevant to the changed components, then rerun the three component test files.

- [ ] **Step 7: Commit**

```bash
git add src/features/ai/providerOptions.ts src/features/settings/SettingsDialog.tsx src/features/settings/settingsDialog.test.tsx src/features/reader/panels/AppearancePanel.tsx src/features/reader/panels/AppearancePanel.test.tsx src/features/reader/RightPanel.tsx src/features/reader/ReaderPage.tsx src/features/reader/ReaderPage.test.tsx
git commit -m "feat: configure authenticated grammar models"
```

### Task 5: Document And Verify

**Files:**
- Create: `docs/openai-compatible-api.md`
- Modify: `docs/README.md`
- Modify: `docs/superpowers/plans/2026-08-15-openai-compatible-auth-reasoning.md`

**Interfaces:**
- Consumes: completed behavior from Tasks 1-4.
- Produces: operator-facing setup instructions and final verification evidence.

- [ ] **Step 1: Write configuration documentation**

Document:

```text
Base URL: https://ushome.amycat.com/openai/v1
Resolved models: /openai/v1/models
Resolved Explain: /openai/v1/chat/completions
Resolved translation: /openai/v1/completions
Authentication: Authorization: Bearer <token>
```

Explain browser-local token storage, model discovery/validation, reasoning choices, Grammar fallback, manual model entry, and server-side LAN/CORS/origin requirements. Do not include a real token.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- src/features/settings/settingsRepository.test.ts src/features/ai/openaiAdapter.test.ts src/features/ai/aiService.test.ts src/features/ai/localModelDiscovery.test.ts src/features/ai/useLocalLlmModels.test.tsx src/features/settings/settingsDialog.test.tsx src/features/reader/panels/AppearancePanel.test.tsx src/features/reader/ReaderPage.test.tsx`

Expected: PASS.

- [ ] **Step 3: Run full tests**

Run: `npm test`

Expected: all Vitest files and tests pass.

- [ ] **Step 4: Run production build**

Run: `npm run build`

Expected: TypeScript checking and Vite build pass; the existing large-chunk warning is acceptable.

- [ ] **Step 5: Inspect scope and commit documentation**

Run: `git diff --check && git status --short && git diff --stat HEAD~4`

Then commit:

```bash
git add docs/openai-compatible-api.md docs/README.md docs/superpowers/plans/2026-08-15-openai-compatible-auth-reasoning.md
git commit -m "docs: explain authenticated openai-compatible setup"
```

- [ ] **Step 6: Confirm final repository state**

Run: `git status --short && git log -7 --oneline --decorate`

Expected: clean feature worktree with focused settings, adapter, discovery, UI, test, and documentation commits.
