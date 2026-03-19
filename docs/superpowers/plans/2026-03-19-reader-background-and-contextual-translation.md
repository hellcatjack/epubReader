# Reader Background and Contextual Translation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free page-background color setting for the book text surface and switch contextual translation to a completion-based gloss pipeline that returns the selected word or phrase meaning instead of drifting into whole-sentence translations.

**Architecture:** Keep background color as a new persisted reader preference shared by the global settings dialog and the in-reader appearance panel, then apply it through the reader theme builder plus reader shell styling. For translation, classify selections into `word`, `phrase`, or `sentence`, route translation through `/v1/completions`, use gloss prompts for words and phrases, and keep full-sentence translation for sentence selections while preserving `sentenceContext` as the disambiguation source.

**Tech Stack:** React 19, TypeScript, Dexie, epub.js, Vitest, Vite

---

## Chunk 1: Reader Background Color

### Task 1: Persist the page background color setting

**Files:**
- Modify: `src/lib/types/settings.ts`
- Modify: `src/features/settings/settingsRepository.ts`
- Modify: `src/features/settings/settingsDialog.test.tsx`
- Modify: `src/features/reader/readerPreferences.test.ts`

- [ ] **Step 1: Write the failing settings tests**

Add assertions that persisted settings include `contentBackgroundColor` and that reader theme output exposes the selected page background color.

- [ ] **Step 2: Run the failing tests**

Run: `npm test -- src/features/settings/settingsDialog.test.tsx src/features/reader/readerPreferences.test.ts`

Expected: FAIL because `contentBackgroundColor` does not exist yet.

- [ ] **Step 3: Implement the minimal settings model changes**

Add `contentBackgroundColor: string` to `SettingsRecord`, `SettingsInput`, default settings, and reader preference mapping. Set theme-aligned defaults such as a light page tone for `light`, a warm paper tone for `sepia`, and a dark page tone for `dark`.

- [ ] **Step 4: Re-run the targeted tests**

Run: `npm test -- src/features/settings/settingsDialog.test.tsx src/features/reader/readerPreferences.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the settings model change**

```bash
git add src/lib/types/settings.ts src/features/settings/settingsRepository.ts src/features/settings/settingsDialog.test.tsx src/features/reader/readerPreferences.test.ts
git commit -m "feat: persist reader page background color"
```

### Task 2: Expose the free color picker in both settings surfaces

**Files:**
- Modify: `src/features/settings/SettingsDialog.tsx`
- Modify: `src/features/settings/settings.css`
- Modify: `src/features/reader/panels/AppearancePanel.tsx`
- Create: `src/features/reader/panels/AppearancePanel.test.tsx`

- [ ] **Step 1: Write the failing component tests**

Create `AppearancePanel.test.tsx` to assert that a `Page background` color input is rendered and emits changes. Extend `SettingsDialog` tests to assert that the same control appears in advanced typography and saves the chosen color.

- [ ] **Step 2: Run the failing tests**

Run: `npm test -- src/features/reader/panels/AppearancePanel.test.tsx src/features/settings/settingsDialog.test.tsx`

Expected: FAIL because the color input does not exist yet.

- [ ] **Step 3: Implement the minimal UI controls**

Add a free color input labeled `Page background` to the advanced typography section in `SettingsDialog` and to the reader `AppearancePanel`. Keep both controls bound to the same persisted field.

- [ ] **Step 4: Re-run the targeted tests**

Run: `npm test -- src/features/reader/panels/AppearancePanel.test.tsx src/features/settings/settingsDialog.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit the settings UI change**

```bash
git add src/features/settings/SettingsDialog.tsx src/features/settings/settings.css src/features/reader/panels/AppearancePanel.tsx src/features/reader/panels/AppearancePanel.test.tsx src/features/settings/settingsDialog.test.tsx
git commit -m "feat: add reader page background color controls"
```

### Task 3: Apply the background color to the reader page surface

**Files:**
- Modify: `src/features/reader/readerPreferences.ts`
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/reader.css`
- Modify: `src/features/reader/ReaderPage.test.tsx`

- [ ] **Step 1: Write the failing reader tests**

Extend `readerPreferences.test.ts` or `ReaderPage.test.tsx` to verify that the selected background color is applied to the book display surface and that the reader shell exposes the same value through a CSS variable or theme rule.

- [ ] **Step 2: Run the failing tests**

Run: `npm test -- src/features/reader/readerPreferences.test.ts src/features/reader/ReaderPage.test.tsx`

Expected: FAIL because the page surface styling does not include the custom background color.

- [ ] **Step 3: Implement the minimal styling**

Thread `contentBackgroundColor` through `buildReaderTheme()` into the EPUB iframe `body` background. Expose the same color in the outer reader shell, `.epub-root`, and loading page shell via a CSS variable from `ReaderPage.tsx`.

- [ ] **Step 4: Re-run the targeted tests**

Run: `npm test -- src/features/reader/readerPreferences.test.ts src/features/reader/ReaderPage.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit the reader surface styling**

```bash
git add src/features/reader/readerPreferences.ts src/features/reader/ReaderPage.tsx src/features/reader/reader.css src/features/reader/ReaderPage.test.tsx
git commit -m "feat: apply custom page background color in reader"
```

## Chunk 2: Completion-Based Contextual Translation

### Task 4: Add selection classification and prompt builder tests

**Files:**
- Create: `src/features/ai/selectionTranslation.ts`
- Create: `src/features/ai/selectionTranslation.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Cover:
- `word` classification for single-token selections like `pressed`
- `phrase` classification for selections like `looked up at him`
- `sentence` classification when the selected text matches the sentence context
- word-gloss prompt content
- phrase-gloss prompt content with few-shot examples
- sentence-mode prompt content

- [ ] **Step 2: Run the failing tests**

Run: `npm test -- src/features/ai/selectionTranslation.test.ts`

Expected: FAIL because the helper does not exist yet.

- [ ] **Step 3: Implement the minimal helper module**

In `selectionTranslation.ts`, add:
- a `SelectionTranslationMode` union: `word | phrase | sentence`
- a classifier that uses normalized `text` and `sentenceContext`
- prompt builders for word gloss, phrase gloss, and sentence translation
- a small output cleanup helper for gloss-mode responses

- [ ] **Step 4: Re-run the helper tests**

Run: `npm test -- src/features/ai/selectionTranslation.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the helper module**

```bash
git add src/features/ai/selectionTranslation.ts src/features/ai/selectionTranslation.test.ts
git commit -m "feat: add selection translation prompt helpers"
```

### Task 5: Switch translation requests to the completions endpoint

**Files:**
- Modify: `src/features/ai/openaiAdapter.ts`
- Modify: `src/features/ai/openaiAdapter.test.ts`
- Modify: `src/features/ai/aiService.ts`

- [ ] **Step 1: Write the failing adapter tests**

Add tests asserting:
- translation uses `/v1/completions`
- word selections produce the word-gloss prompt
- phrase selections produce the phrase-gloss prompt
- sentence selections produce the sentence translation prompt
- explanation remains on the current path

- [ ] **Step 2: Run the failing tests**

Run: `npm test -- src/features/ai/openaiAdapter.test.ts`

Expected: FAIL because translation still uses `chat/completions`.

- [ ] **Step 3: Implement the minimal adapter routing**

Add a completion request helper in `openaiAdapter.ts` and route `translateSelection()` through it. Use `selectionTranslation.ts` to classify the selection and build the prompt. Preserve explanation behavior and existing error normalization.

- [ ] **Step 4: Re-run the adapter tests**

Run: `npm test -- src/features/ai/openaiAdapter.test.ts src/features/ai/selectionTranslation.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the adapter switch**

```bash
git add src/features/ai/openaiAdapter.ts src/features/ai/openaiAdapter.test.ts src/features/ai/aiService.ts src/features/ai/selectionTranslation.ts src/features/ai/selectionTranslation.test.ts
git commit -m "feat: use completions for contextual translation"
```

### Task 6: Keep reader-side context plumbing and add gloss-mode regression coverage

**Files:**
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/selectionActions.test.tsx`
- Modify: `src/features/reader/ReaderPage.test.tsx`

- [ ] **Step 1: Write the failing integration assertions**

Extend reader tests to assert:
- word selections pass `sentenceContext` and are treated as contextual translations
- phrase selections pass `sentenceContext`
- full-sentence selections remain full-sentence translations

- [ ] **Step 2: Run the failing tests**

Run: `npm test -- src/features/reader/selectionActions.test.tsx src/features/reader/ReaderPage.test.tsx`

Expected: FAIL until the adapter-facing request shape and mode behavior match the new contract.

- [ ] **Step 3: Implement the minimal reader-side adjustments**

Keep `sentenceContext` plumbing intact, ensure translation requests pass the context field, and only add the minimum reader-side changes needed to match the new adapter contract.

- [ ] **Step 4: Re-run the integration tests**

Run: `npm test -- src/features/reader/selectionActions.test.tsx src/features/reader/ReaderPage.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit the reader integration updates**

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/selectionActions.test.tsx src/features/reader/ReaderPage.test.tsx
git commit -m "test: cover contextual word and phrase translation"
```

### Task 7: Add one guarded retry for obvious gloss failures

**Files:**
- Modify: `src/features/ai/selectionTranslation.ts`
- Modify: `src/features/ai/openaiAdapter.ts`
- Modify: `src/features/ai/openaiAdapter.test.ts`

- [ ] **Step 1: Write the failing retry tests**

Add tests for the gloss-mode guard:
- outputs with sentence punctuation or obviously sentence-like length trigger one stricter retry
- already valid gloss outputs do not retry

- [ ] **Step 2: Run the failing tests**

Run: `npm test -- src/features/ai/openaiAdapter.test.ts src/features/ai/selectionTranslation.test.ts`

Expected: FAIL because retry behavior is not implemented.

- [ ] **Step 3: Implement a single stricter retry path**

Add one retry for `word` and `phrase` translation when the first completion looks like a sentence. Do not add repair chains or multiple fallback loops.

- [ ] **Step 4: Re-run the retry tests**

Run: `npm test -- src/features/ai/openaiAdapter.test.ts src/features/ai/selectionTranslation.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the retry guard**

```bash
git add src/features/ai/selectionTranslation.ts src/features/ai/openaiAdapter.ts src/features/ai/openaiAdapter.test.ts
git commit -m "feat: retry contextual gloss when output drifts into sentences"
```

## Chunk 3: Verification and Deployment

### Task 8: Run automated verification

**Files:**
- Verify only

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: PASS

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: PASS

### Task 9: Run strict local model prompt smoke tests

**Files:**
- Verify only

- [ ] **Step 1: Verify word-gloss disambiguation on the local model**

Run:

```bash
curl -sS http://192.168.1.31:8001/v1/completions \
  -H 'Content-Type: application/json' \
  --data '{"model":"tencent/HY-MT1.5-1.8B-GGUF:Q4_K_M","prompt":"任务：只翻译被选中英文片段在句中的含义。不要翻译整句，不要解释，只输出中文词义。\n选中片段：pressed\n句子：She looked pressed for time before the meeting.\n答案：","max_tokens":32,"temperature":0.1}'
```

Expected: output close to `时间紧迫的`

- [ ] **Step 2: Verify word-gloss meaning changes with a different sentence**

Run:

```bash
curl -sS http://192.168.1.31:8001/v1/completions \
  -H 'Content-Type: application/json' \
  --data '{"model":"tencent/HY-MT1.5-1.8B-GGUF:Q4_K_M","prompt":"任务：只翻译被选中英文片段在句中的含义。不要翻译整句，不要解释，只输出中文词义。\n选中片段：pressed\n句子：The flowers were pressed between pages.\n答案：","max_tokens":32,"temperature":0.1}'
```

Expected: output close to `压平`

- [ ] **Step 3: Verify phrase-gloss behavior**

Run:

```bash
curl -sS http://192.168.1.31:8001/v1/completions \
  -H 'Content-Type: application/json' \
  --data '{"model":"tencent/HY-MT1.5-1.8B-GGUF:Q4_K_M","prompt":"示例1\n选中短语：looked up at her\n句子：He looked up at her and smiled.\n答案：抬头看着她\n\n示例2\n选中短语：ran out of time\n句子：She ran out of time before finishing the task.\n答案：来不及了\n\n现在完成同样的任务：只输出选中短语在句中的中文短语，不要整句，不要标点。\n选中短语：looked up at him\n句子：He looked up at him before leaving the room.\n答案：","max_tokens":24,"temperature":0.1}'
```

Expected: output close to `抬头看着他`

### Task 10: Deploy the updated frontend

**Files:**
- Verify and deploy only

- [ ] **Step 1: Sync the built app**

Run: `rsync -a --delete dist/ /app/epubReader/`

Expected: exit code `0`

- [ ] **Step 2: Commit the finished feature work**

```bash
git status --short
git add src/lib/types/settings.ts src/features/settings/settingsRepository.ts src/features/settings/SettingsDialog.tsx src/features/settings/settings.css src/features/settings/settingsDialog.test.tsx src/features/reader/panels/AppearancePanel.tsx src/features/reader/panels/AppearancePanel.test.tsx src/features/reader/readerPreferences.ts src/features/reader/readerPreferences.test.ts src/features/reader/ReaderPage.tsx src/features/reader/ReaderPage.test.tsx src/features/reader/reader.css src/features/ai/aiService.ts src/features/ai/openaiAdapter.ts src/features/ai/openaiAdapter.test.ts src/features/ai/selectionTranslation.ts src/features/ai/selectionTranslation.test.ts src/features/reader/selectionActions.test.tsx
git commit -m "feat: add page background color and contextual translation"
```
