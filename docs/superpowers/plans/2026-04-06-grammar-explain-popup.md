# Grammar Explain Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current sidebar-bound `Explain` output with an asynchronous grammar-analysis popup, backed by independent grammar LLM settings and focused Chinese grammar prompts.

**Architecture:** Keep the existing `Explain` triggers in the top bar and selection actions, but move display responsibility into a dedicated popup component owned by `ReaderPage`. Route `explainSelection()` through a grammar-specific adapter resolution path, preserve fallback behavior when grammar settings are empty, and remove the explanation surface from the right sidebar.

**Tech Stack:** React 19, TypeScript, Vitest, Playwright, existing local OpenAI-compatible adapters, Dexie-backed settings persistence.

---

## File Structure

- Modify: `src/lib/types/settings.ts`
  - Add grammar-specific API and model settings.
- Modify: `src/features/settings/settingsRepository.ts`
  - Add defaults and persistence compatibility for grammar settings.
- Modify: `src/features/settings/SettingsDialog.tsx`
  - Add grammar API URL and grammar model fields.
- Modify: `src/features/reader/panels/AppearancePanel.tsx`
  - Add reader-page access to grammar API URL and grammar model.
- Modify: `src/features/ai/aiService.ts`
  - Resolve explain requests through grammar-specific settings before fallback.
- Modify: `src/features/ai/openaiAdapter.ts`
  - Replace bilingual explanation prompt/output with Chinese grammar analysis.
- Modify: `src/features/ai/geminiAdapter.ts`
  - Align fallback explain behavior to the new Chinese grammar-analysis prompt.
- Create: `src/features/reader/GrammarExplainPopup.tsx`
  - Dedicated popup surface with loading/result/error and close button.
- Modify: `src/features/reader/ReaderPage.tsx`
  - Own popup state, async explain request flow, and close behavior.
- Modify: `src/features/reader/RightPanel.tsx`
  - Stop passing explanation content through the sidebar panel path.
- Modify: `src/features/reader/panels/AiResultPanel.tsx`
  - Remove explanation surface and keep only selection, IPA, translation.
- Modify: `src/features/reader/reader.css`
  - Style the grammar popup and remove obsolete explanation panel styling assumptions where needed.
- Test: `src/features/settings/settingsDialog.test.tsx`
- Test: `src/features/reader/panels/AppearancePanel.test.tsx`
- Test: `src/features/ai/aiService.test.ts`
- Test: `src/features/ai/openaiAdapter.test.ts`
- Test: `src/features/ai/geminiAdapter.test.ts`
- Test: `src/features/reader/panels/AiResultPanel.test.tsx`
- Test: `src/features/reader/ReaderPage.test.tsx`
- Create/Test: `src/features/reader/GrammarExplainPopup.test.tsx`
- Test: `tests/e2e/ai-actions.spec.ts`

### Task 1: Add Grammar-Specific Settings

**Files:**
- Modify: `src/lib/types/settings.ts`
- Modify: `src/features/settings/settingsRepository.ts`
- Test: `src/features/settings/settingsRepository.test.ts` or existing repository-adjacent tests if present

- [ ] **Step 1: Write the failing settings test**

Add a test covering defaults and persistence for grammar settings.

```ts
it("persists grammar-specific llm settings with defaults", async () => {
  await saveSettings({
    ...defaultSettings,
    grammarLlmApiUrl: "http://localhost:9001/v1/chat/completions",
    grammarLlmModel: "grammar-model",
  });

  const settings = await getResolvedSettings();

  expect(settings.grammarLlmApiUrl).toBe("http://localhost:9001/v1/chat/completions");
  expect(settings.grammarLlmModel).toBe("grammar-model");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/settings/settingsRepository.test.ts`

Expected: FAIL because `grammarLlmApiUrl` / `grammarLlmModel` do not exist yet.

- [ ] **Step 3: Add the new settings fields**

Update `src/lib/types/settings.ts`:

```ts
export type SettingsInput = {
  // existing fields...
  grammarLlmApiUrl: string;
  grammarLlmModel: string;
};
```

Update `src/features/settings/settingsRepository.ts` defaults:

```ts
export const defaultSettings: SettingsInput = {
  // existing defaults...
  grammarLlmApiUrl: "",
  grammarLlmModel: "",
};
```

Ensure `getResolvedSettings()` merges missing persisted values against the new defaults so old stored settings still resolve.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/settings/settingsRepository.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/settings.ts src/features/settings/settingsRepository.ts src/features/settings/settingsRepository.test.ts
git commit -m "feat: add grammar llm settings"
```

### Task 2: Add Grammar Settings UI

**Files:**
- Modify: `src/features/settings/SettingsDialog.tsx`
- Modify: `src/features/reader/panels/AppearancePanel.tsx`
- Test: `src/features/settings/settingsDialog.test.tsx`
- Test: `src/features/reader/panels/AppearancePanel.test.tsx`

- [ ] **Step 1: Write the failing settings dialog test**

Add a test that expects grammar settings fields in the global settings dialog.

```tsx
it("shows grammar llm api and model fields", async () => {
  render(<SettingsDialog />);

  expect(await screen.findByLabelText("Grammar LLM API URL")).toBeInTheDocument();
  expect(screen.getByLabelText("Grammar LLM model")).toBeInTheDocument();
});
```

- [ ] **Step 2: Write the failing appearance panel test**

Add a reader appearance test for the same fields.

```tsx
it("exposes grammar llm api controls in the reader appearance panel", () => {
  render(<AppearancePanel {...props} />);

  expect(screen.getByLabelText("Grammar LLM API URL")).toBeInTheDocument();
  expect(screen.getByLabelText("Grammar LLM model")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
npm test -- src/features/settings/settingsDialog.test.tsx
npm test -- src/features/reader/panels/AppearancePanel.test.tsx
```

Expected: FAIL because the grammar fields are missing.

- [ ] **Step 4: Add the grammar settings fields to both UIs**

In `src/features/settings/SettingsDialog.tsx`, add two controlled fields:

```tsx
<label className="settings-field settings-field-wide">
  <span>Grammar LLM API URL</span>
  <input
    aria-label="Grammar LLM API URL"
    onChange={(event) =>
      setSettings((current) => ({ ...current, grammarLlmApiUrl: event.target.value }))
    }
    type="url"
    value={settings.grammarLlmApiUrl}
  />
</label>

<label className="settings-field settings-field-wide">
  <span>Grammar LLM model</span>
  <input
    aria-label="Grammar LLM model"
    onChange={(event) =>
      setSettings((current) => ({ ...current, grammarLlmModel: event.target.value }))
    }
    type="text"
    value={settings.grammarLlmModel}
  />
</label>
```

Mirror those controls in `src/features/reader/panels/AppearancePanel.tsx` using the existing reader settings update flow.

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
npm test -- src/features/settings/settingsDialog.test.tsx
npm test -- src/features/reader/panels/AppearancePanel.test.tsx
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/settings/SettingsDialog.tsx src/features/reader/panels/AppearancePanel.tsx src/features/settings/settingsDialog.test.tsx src/features/reader/panels/AppearancePanel.test.tsx
git commit -m "feat: expose grammar llm settings"
```

### Task 3: Route Explain Through Grammar-Specific Settings

**Files:**
- Modify: `src/features/ai/aiService.ts`
- Test: `src/features/ai/aiService.test.ts`

- [ ] **Step 1: Write the failing aiService test**

Add a test that expects `explainSelection()` to prefer grammar settings over normal translation settings.

```ts
it("routes explain requests through grammar-specific endpoint and model when configured", async () => {
  const createLocalAdapter = vi.fn().mockReturnValue({
    translateSelection: vi.fn(),
    explainSelection: vi.fn().mockResolvedValue("语法解析"),
    synthesizeSpeech: vi.fn(),
  });

  const service = createAiService({
    createLocalAdapter,
    loadSettings: async () => ({
      ...defaultSettings,
      llmApiUrl: "http://localhost:8001/v1/chat/completions",
      localLlmModel: "translation-model",
      grammarLlmApiUrl: "http://localhost:9001/v1/chat/completions",
      grammarLlmModel: "grammar-model",
    }),
  });

  await service.explainSelection("Despite himself, Ender's voice trembled.", { targetLanguage: "zh-CN" });

  expect(createLocalAdapter).toHaveBeenCalledWith(
    expect.objectContaining({
      endpoint: "http://localhost:9001/v1/chat/completions",
      textModel: "grammar-model",
    }),
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/ai/aiService.test.ts`

Expected: FAIL because explain still uses the translation adapter path.

- [ ] **Step 3: Implement grammar-first explain routing**

Update `src/features/ai/aiService.ts` to use a dedicated adapter resolution path:

```ts
async function getExplainAdapter() {
  const settings = await loadSettings();

  if (settings.grammarLlmApiUrl.trim() || settings.grammarLlmModel.trim()) {
    return createLocalAdapter({
      ...(settings.grammarLlmApiUrl.trim() ? { endpoint: settings.grammarLlmApiUrl.trim() } : {}),
      ...(settings.grammarLlmModel.trim() ? { textModel: settings.grammarLlmModel.trim() } : {}),
    });
  }

  return getAdapter();
}
```

Then switch `explainSelection()` to `await getExplainAdapter()`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/ai/aiService.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/ai/aiService.ts src/features/ai/aiService.test.ts
git commit -m "feat: route explain through grammar settings"
```

### Task 4: Replace Explain Prompt With Chinese Grammar Analysis

**Files:**
- Modify: `src/features/ai/openaiAdapter.ts`
- Modify: `src/features/ai/geminiAdapter.ts`
- Test: `src/features/ai/openaiAdapter.test.ts`
- Test: `src/features/ai/geminiAdapter.test.ts`

- [ ] **Step 1: Write the failing local adapter test**

Add a test proving explain no longer builds bilingual output.

```ts
it("requests chinese grammar analysis only for explain", async () => {
  const fakeFetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "句子主干是..." } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

  const adapter = createOpenAIAdapter({ fetch: fakeFetch });

  await expect(
    adapter.explainSelection("Despite himself, Ender's voice trembled.", { targetLanguage: "zh-CN" }),
  ).resolves.toBe("句子主干是...");

  const requestBody = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(requestBody.messages[1]?.content).toContain("请用中文解析下面英文片段的语法结构");
  expect(requestBody.messages[1]?.content).not.toContain("English explanation");
});
```

- [ ] **Step 2: Write the failing Gemini fallback test**

```ts
it("uses the same chinese grammar-analysis prompt for gemini explain fallback", async () => {
  // assert prompt content sent to Gemini generateContent
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
npm test -- src/features/ai/openaiAdapter.test.ts
npm test -- src/features/ai/geminiAdapter.test.ts
```

Expected: FAIL because explain still returns bilingual explanation.

- [ ] **Step 4: Implement the new grammar-analysis prompt**

Update local and Gemini explain prompt builders to:

```ts
function createExplainSectionPrompt(text: string) {
  return [
    "请用中文解析下面英文片段的语法结构。",
    "重点说明句子主干、从句或短语作用、关键词的语法功能。",
    "只输出中文解析，不要翻译整段，不要额外寒暄。",
    "",
    text,
  ].join("\\n");
}
```

Return the single Chinese result directly instead of composing bilingual output.

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
npm test -- src/features/ai/openaiAdapter.test.ts
npm test -- src/features/ai/geminiAdapter.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/ai/openaiAdapter.ts src/features/ai/geminiAdapter.ts src/features/ai/openaiAdapter.test.ts src/features/ai/geminiAdapter.test.ts
git commit -m "feat: switch explain to chinese grammar analysis"
```

### Task 5: Remove Explanation From the Right Sidebar

**Files:**
- Modify: `src/features/reader/panels/AiResultPanel.tsx`
- Modify: `src/features/reader/RightPanel.tsx`
- Test: `src/features/reader/panels/AiResultPanel.test.tsx`

- [ ] **Step 1: Write the failing panel test**

Add a test proving the sidebar no longer shows an explanation section.

```tsx
it("does not render the explanation surface in reading assistant", () => {
  render(<AiResultPanel selectedText="pressed" translation="按压" ipa="/prest/" />);

  expect(screen.queryByRole("heading", { name: "Explanation" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/reader/panels/AiResultPanel.test.tsx`

Expected: FAIL because the panel still renders `Explanation`.

- [ ] **Step 3: Remove the explanation surface from the sidebar**

Update `src/features/reader/panels/AiResultPanel.tsx` to remove:

```tsx
<section className="reader-ai-surface reader-ai-surface-secondary" aria-label="Explanation result">
  ...
</section>
```

Trim props to:

```ts
type AiResultPanelProps = {
  ipa?: string;
  onReadAloud?: () => void;
  selectedText?: string;
  translation?: string;
  translationError?: string;
};
```

Update `src/features/reader/RightPanel.tsx` to stop passing explanation props through.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/reader/panels/AiResultPanel.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/panels/AiResultPanel.tsx src/features/reader/RightPanel.tsx src/features/reader/panels/AiResultPanel.test.tsx
git commit -m "refactor: remove explain from reading assistant"
```

### Task 6: Add the Grammar Popup Component

**Files:**
- Create: `src/features/reader/GrammarExplainPopup.tsx`
- Create: `src/features/reader/GrammarExplainPopup.test.tsx`
- Modify: `src/features/reader/reader.css`

- [ ] **Step 1: Write the failing popup component test**

Create a focused popup test file:

```tsx
it("renders loading, result, error, and close button states", async () => {
  const onClose = vi.fn();
  const { rerender } = render(
    <GrammarExplainPopup isOpen loading selectedText="Despite himself, Ender's voice trembled." onClose={onClose} />,
  );

  expect(screen.getByText("正在解析语法...")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Close grammar popup" })).toBeInTheDocument();

  rerender(
    <GrammarExplainPopup isOpen loading={false} result="句子主干是..." selectedText="Despite himself, Ender's voice trembled." onClose={onClose} />,
  );

  expect(screen.getByText("句子主干是...")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/reader/GrammarExplainPopup.test.tsx`

Expected: FAIL because the component does not exist yet.

- [ ] **Step 3: Create the popup component and styles**

Create `src/features/reader/GrammarExplainPopup.tsx`:

```tsx
type GrammarExplainPopupProps = {
  error?: string;
  isOpen: boolean;
  loading: boolean;
  onClose: () => void;
  result?: string;
  selectedText?: string;
};

export function GrammarExplainPopup({
  error,
  isOpen,
  loading,
  onClose,
  result,
  selectedText,
}: GrammarExplainPopupProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <aside className="grammar-explain-popup" aria-label="Grammar explanation popup">
      <div className="grammar-explain-popup-header">
        <h2>Grammar</h2>
        <button aria-label="Close grammar popup" onClick={onClose} type="button">
          ×
        </button>
      </div>
      {selectedText ? <p className="grammar-explain-popup-selection">{selectedText}</p> : null}
      <div className="grammar-explain-popup-body">
        {loading ? <p>正在解析语法...</p> : null}
        {!loading && error ? <p className="grammar-explain-popup-error">{error}</p> : null}
        {!loading && !error && result ? <p>{result}</p> : null}
      </div>
    </aside>
  );
}
```

Add corresponding CSS in `src/features/reader/reader.css`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/reader/GrammarExplainPopup.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/GrammarExplainPopup.tsx src/features/reader/GrammarExplainPopup.test.tsx src/features/reader/reader.css
git commit -m "feat: add grammar explain popup component"
```

### Task 7: Wire ReaderPage to the New Async Popup

**Files:**
- Modify: `src/features/reader/ReaderPage.tsx`
- Test: `src/features/reader/ReaderPage.test.tsx`

- [ ] **Step 1: Write the failing reader page test**

Add a test covering the async popup flow:

```tsx
it("opens the grammar popup immediately and updates it asynchronously", async () => {
  const explainSelection = vi.fn().mockResolvedValue("句子主干是 Ender's voice trembled。");
  render(<ReaderPage ai={{ ...ai, explainSelection }} runtime={runtime} />);

  // seed a selection, click Explain

  expect(screen.getByLabelText("Grammar explanation popup")).toBeInTheDocument();
  expect(screen.getByText("正在解析语法...")).toBeInTheDocument();
  expect(await screen.findByText("句子主干是 Ender's voice trembled。")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/reader/ReaderPage.test.tsx`

Expected: FAIL because explain still writes into sidebar state.

- [ ] **Step 3: Replace sidebar explanation state with popup state**

In `src/features/reader/ReaderPage.tsx`, add dedicated popup state:

```ts
const [grammarPopupOpen, setGrammarPopupOpen] = useState(false);
const [grammarPopupLoading, setGrammarPopupLoading] = useState(false);
const [grammarPopupResult, setGrammarPopupResult] = useState("");
const [grammarPopupError, setGrammarPopupError] = useState("");
const [grammarPopupSelection, setGrammarPopupSelection] = useState("");
```

Update `handleExplain()` to:

```ts
setGrammarPopupOpen(true);
setGrammarPopupSelection(nextText);
setGrammarPopupLoading(true);
setGrammarPopupError("");
setGrammarPopupResult("");

try {
  const result = await ai.explainSelection(nextText, { targetLanguage: "zh-CN" });
  setGrammarPopupResult(result);
} catch (error) {
  setGrammarPopupError("语法解析失败，请重试。");
} finally {
  setGrammarPopupLoading(false);
}
```

Render:

```tsx
<GrammarExplainPopup
  error={grammarPopupError}
  isOpen={grammarPopupOpen}
  loading={grammarPopupLoading}
  onClose={() => setGrammarPopupOpen(false)}
  result={grammarPopupResult}
  selectedText={grammarPopupSelection}
/>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/reader/ReaderPage.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/ReaderPage.test.tsx
git commit -m "feat: wire explain popup into reader page"
```

### Task 8: Verify Interaction Rules and Browser Behavior

**Files:**
- Modify: `tests/e2e/ai-actions.spec.ts`
- Test: `tests/e2e/ai-actions.spec.ts`

- [ ] **Step 1: Write the failing browser test**

Add a browser test for async popup behavior:

```ts
test("explain shows an async grammar popup that stays open until closed", async ({ page }) => {
  // select text
  // click Explain
  await expect(page.getByLabel("Grammar explanation popup")).toBeVisible();
  await expect(page.getByText("正在解析语法...")).toBeVisible();
  await expect(page.getByText("句子主干")).toBeVisible();

  // click outside; popup should still exist
  await page.mouse.click(20, 20);
  await expect(page.getByLabel("Grammar explanation popup")).toBeVisible();

  // close via X
  await page.getByRole("button", { name: "Close grammar popup" }).click();
  await expect(page.getByLabel("Grammar explanation popup")).toBeHidden();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run e2e -- tests/e2e/ai-actions.spec.ts -g "explain shows an async grammar popup that stays open until closed"`

Expected: FAIL because the popup behavior does not exist yet.

- [ ] **Step 3: Adjust any missing interaction details**

Add any missing markup, labels, or CSS positioning hooks required by the e2e test. Keep the popup outside the main text column and preserve `X`-only close behavior.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run e2e -- tests/e2e/ai-actions.spec.ts -g "explain shows an async grammar popup that stays open until closed"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/ai-actions.spec.ts src/features/reader/ReaderPage.tsx src/features/reader/GrammarExplainPopup.tsx src/features/reader/reader.css
git commit -m "test: cover async grammar explain popup"
```

### Task 9: Final Verification and Publish

**Files:**
- Verify all files changed in prior tasks

- [ ] **Step 1: Run targeted unit tests**

Run:

```bash
npm test -- src/features/ai/aiService.test.ts
npm test -- src/features/ai/openaiAdapter.test.ts
npm test -- src/features/ai/geminiAdapter.test.ts
npm test -- src/features/reader/GrammarExplainPopup.test.tsx
npm test -- src/features/reader/ReaderPage.test.tsx
npm test -- src/features/reader/panels/AiResultPanel.test.tsx
npm test -- src/features/settings/settingsDialog.test.tsx
npm test -- src/features/reader/panels/AppearancePanel.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run the focused browser regression**

Run:

```bash
npm run e2e -- tests/e2e/ai-actions.spec.ts
```

Expected: PASS

- [ ] **Step 3: Run full unit test suite**

Run:

```bash
npm test
```

Expected: PASS

- [ ] **Step 4: Build the production bundle**

Run:

```bash
npm run build
```

Expected: Vite build succeeds. Existing chunk-size warnings are acceptable if unchanged.

- [ ] **Step 5: Publish to production path**

Run:

```bash
rsync -a --delete dist/ /app/epubReader/
```

Expected: Exit code 0

- [ ] **Step 6: Commit final integration**

```bash
git add src/features/ai src/features/reader src/features/settings src/lib/types/settings.ts tests/e2e/ai-actions.spec.ts
git commit -m "feat: move explain into async grammar popup"
```
