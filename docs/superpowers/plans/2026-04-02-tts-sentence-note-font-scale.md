# TTS Sentence Note Font Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 TTS 实时中文侧注增加独立字号设置，并在 `Settings` 与 `Appearance` 中可调。

**Architecture:** 新增 `ttsSentenceTranslationFontScale` 设置字段，沿用现有 settings 存储链路，在 `ReaderPage` 中下发成独立 CSS 变量，由 `TtsSentenceTranslationNote` 统一消费。正文排版与其他翻译面板不受影响。

**Tech Stack:** React 19, TypeScript, Dexie settings storage, Vitest, CSS custom properties

---

### Task 1: 锁定设置类型与默认值

**Files:**
- Modify: `src/lib/types/settings.ts`
- Modify: `src/features/settings/settingsRepository.ts`
- Modify: `src/features/settings/settingsRepository.test.ts` (if needed) or existing settings tests

- [ ] **Step 1: 写失败测试**

在现有 settings 测试附近补充断言：
- 默认 settings 包含 `ttsSentenceTranslationFontScale: 1`
- 旧记录迁移后也会得到该字段

- [ ] **Step 2: 运行定向测试，确认失败**

Run:

```bash
npm test -- src/features/settings/settingsDialog.test.tsx src/lib/db/appDb.test.ts
```

Expected:
- 因缺少新字段或默认值断言失败

- [ ] **Step 3: 最小实现类型与默认值**

修改：
- `src/lib/types/settings.ts`
- `src/features/settings/settingsRepository.ts`

只加入新字段和默认值，不改其他设置行为。

- [ ] **Step 4: 重新运行定向测试**

Run:

```bash
npm test -- src/features/settings/settingsDialog.test.tsx src/lib/db/appDb.test.ts
```

Expected:
- 新字段相关测试通过

### Task 2: 暴露设置入口

**Files:**
- Modify: `src/features/settings/SettingsDialog.tsx`
- Modify: `src/features/settings/settingsDialog.test.tsx`
- Modify: `src/features/reader/panels/AppearancePanel.tsx`
- Modify: `src/features/reader/panels/AppearancePanel.test.tsx`

- [ ] **Step 1: 写失败测试**

补充断言：
- `SettingsDialog` 中存在 `TTS note size`
- 保存后会持久化数值
- `AppearancePanel` 中存在 `TTS note size`
- 修改后会回传 `{ ttsSentenceTranslationFontScale: ... }`

- [ ] **Step 2: 运行定向测试，确认失败**

Run:

```bash
npm test -- src/features/settings/settingsDialog.test.tsx src/features/reader/panels/AppearancePanel.test.tsx
```

Expected:
- 新控件不存在，测试失败

- [ ] **Step 3: 最小实现 UI**

新增数值输入：
- `min="0.85"`
- `max="1.6"`
- `step="0.05"`

位置：
- `SettingsDialog` 的排版/外观区
- `AppearancePanel`

- [ ] **Step 4: 重新运行定向测试**

Run:

```bash
npm test -- src/features/settings/settingsDialog.test.tsx src/features/reader/panels/AppearancePanel.test.tsx
```

Expected:
- 新增设置入口测试通过

### Task 3: 让侧注消费独立字号设置

**Files:**
- Modify: `src/features/reader/TtsSentenceTranslationNote.tsx`
- Modify: `src/features/reader/TtsSentenceTranslationNote.test.tsx`
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/ReaderPage.test.tsx`
- Modify: `src/features/reader/reader.css`

- [ ] **Step 1: 写失败测试**

补充断言：
- `TtsSentenceTranslationNote` 接受字体比例并体现到样式
- `ReaderPage` 在显示侧注时会下发 `--reader-tts-sentence-note-font-scale`

- [ ] **Step 2: 运行定向测试，确认失败**

Run:

```bash
npm test -- src/features/reader/TtsSentenceTranslationNote.test.tsx src/features/reader/ReaderPage.test.tsx
```

Expected:
- 侧注字号相关断言失败

- [ ] **Step 3: 最小实现**

修改：
- `ReaderPage.tsx`：下发 CSS 变量
- `TtsSentenceTranslationNote.tsx`：消费变量或显式样式
- `reader.css`：把字体大小与该变量绑定

- [ ] **Step 4: 重新运行定向测试**

Run:

```bash
npm test -- src/features/reader/TtsSentenceTranslationNote.test.tsx src/features/reader/ReaderPage.test.tsx
```

Expected:
- 新增断言通过

### Task 4: 全量验证

**Files:**
- Modify: `src/lib/types/settings.ts`
- Modify: `src/features/settings/settingsRepository.ts`
- Modify: `src/features/settings/SettingsDialog.tsx`
- Modify: `src/features/reader/panels/AppearancePanel.tsx`
- Modify: `src/features/reader/TtsSentenceTranslationNote.tsx`
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: tests above

- [ ] **Step 1: 运行全量测试**

Run:

```bash
npm test
```

Expected:
- 全部通过

- [ ] **Step 2: 运行构建**

Run:

```bash
npm run build
```

Expected:
- 构建成功

- [ ] **Step 3: 发布到当前前端目录**

Run:

```bash
rsync -a --delete dist/ /app/epubReader/
```

Expected:
- 无错误退出
