# Reader Stage Background Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `Page background` 同时控制正文背景、正文外框背景和正文外部阅读舞台背景，而不影响顶部栏和两侧栏。

**Architecture:** 继续以 `settings.contentBackgroundColor` 为唯一颜色输入，通过 `ReaderPage` 下发统一 CSS 变量，并把 `reader-viewport-shell`、`epub-viewport`、`epub-root`、`reader-page-card` 的固定米色背景收敛到该变量。EPUB iframe 内正文背景继续由 `buildReaderTheme()` 保持同步。

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Playwright, CSS custom properties

---

### Task 1: 锁定阅读舞台统一底色的页面样式行为

**Files:**
- Modify: `src/features/reader/ReaderPage.test.tsx`
- Test: `src/features/reader/ReaderPage.test.tsx`

- [ ] **Step 1: 写失败测试，要求阅读舞台相关容器共享同一背景变量**

在 `ReaderPage` 现有 `contentBackgroundColor` 测试附近新增断言，覆盖：
- `.reader-stage`
- `.reader-viewport-shell`
- `.epub-viewport`
- `.epub-root`

断言这些元素的行内样式或计算来源都能看到 `--reader-page-background: #c0ffee`，并且 `.reader-topbar` 不受该变量直接覆盖。

- [ ] **Step 2: 运行定向测试，确认当前行为未完全满足**

Run:

```bash
npm test -- src/features/reader/ReaderPage.test.tsx
```

Expected:
- 新增断言失败，证明舞台容器还没有完整统一到底色变量

- [ ] **Step 3: 最小实现 `ReaderPage` 样式变量范围**

在 `src/features/reader/ReaderPage.tsx` 中保持 `--reader-page-background` 作为唯一变量来源，必要时补充舞台容器可消费的附加变量，但不要新增第二个颜色设置字段。

- [ ] **Step 4: 重新运行定向测试**

Run:

```bash
npm test -- src/features/reader/ReaderPage.test.tsx
```

Expected:
- 新增断言通过

- [ ] **Step 5: 提交**

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/ReaderPage.test.tsx
git commit -m "test: cover unified reader stage background"
```

### Task 2: 收敛阅读舞台 CSS 背景链路

**Files:**
- Modify: `src/features/reader/reader.css`
- Test: `src/features/reader/ReaderPage.test.tsx`

- [ ] **Step 1: 写/扩展失败测试，锁定固定米色背景已移除**

在 `ReaderPage` 相关样式测试里补充断言：
- `.reader-viewport-shell`
- `.epub-viewport`
- `.epub-root`
- `.reader-page-card`

不再依赖固定的米色渐变作为主背景，而是统一使用 `var(--reader-page-background)`。

- [ ] **Step 2: 运行定向测试并确认失败**

Run:

```bash
npm test -- src/features/reader/ReaderPage.test.tsx
```

Expected:
- 关于固定背景或统一变量的断言失败

- [ ] **Step 3: 最小修改 `reader.css`**

在 `src/features/reader/reader.css` 中：
- 让 `reader-stage` 保持透明
- 让 `reader-viewport-shell` 使用 `var(--reader-page-background)`
- 让 `epub-viewport` 使用 `var(--reader-page-background)`
- 保留 `epub-root` 和 `reader-page-card` 的同色背景
- 保留边框、阴影、圆角，不再让固定米色渐变承担主底色角色

- [ ] **Step 4: 运行定向测试**

Run:

```bash
npm test -- src/features/reader/ReaderPage.test.tsx
```

Expected:
- 相关样式断言通过

- [ ] **Step 5: 提交**

```bash
git add src/features/reader/reader.css src/features/reader/ReaderPage.test.tsx
git commit -m "feat: unify reader stage background surfaces"
```

### Task 3: 保持 EPUB iframe 正文背景同步

**Files:**
- Modify: `src/features/reader/readerPreferences.test.ts`
- Modify: `src/features/reader/readerPreferences.ts`
- Test: `src/features/reader/readerPreferences.test.ts`

- [ ] **Step 1: 扩展失败测试，确认 `buildReaderTheme()` 继续输出正文背景色**

在 `readerPreferences.test.ts` 中补一条明确断言：

```ts
expect(theme.body["background-color"]).toBe("#c0ffee");
```

并保留 `paginated` / `scrolled` 场景都不回退到旧主题色。

- [ ] **Step 2: 运行定向测试**

Run:

```bash
npm test -- src/features/reader/readerPreferences.test.ts
```

Expected:
- 如果链路已有覆盖则通过；若当前值被改坏则失败

- [ ] **Step 3: 仅在必要时最小调整实现**

若测试暴露 `buildReaderTheme()` 仍与新舞台逻辑不一致，则在 `src/features/reader/readerPreferences.ts` 中修正；否则保持代码不动。

- [ ] **Step 4: 重新运行定向测试**

Run:

```bash
npm test -- src/features/reader/readerPreferences.test.ts
```

Expected:
- 全部通过

- [ ] **Step 5: 提交**

```bash
git add src/features/reader/readerPreferences.ts src/features/reader/readerPreferences.test.ts
git commit -m "test: lock page background into epub theme"
```

### Task 4: 全量验证并发布

**Files:**
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/reader.css`
- Modify: `src/features/reader/ReaderPage.test.tsx`
- Modify: `src/features/reader/readerPreferences.test.ts`

- [ ] **Step 1: 运行前端测试**

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
- 允许保留既有 chunk size warning

- [ ] **Step 3: 发布到当前前端目录**

Run:

```bash
rsync -a --delete dist/ /app/epubReader/
```

Expected:
- 无错误退出

- [ ] **Step 4: 提交最终实现**

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/reader.css src/features/reader/ReaderPage.test.tsx src/features/reader/readerPreferences.test.ts
git commit -m "feat: unify reader page background surfaces"
```
