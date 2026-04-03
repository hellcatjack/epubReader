# Reader Stage Background Unification Design

## Goal

让 `Page background` 颜色自定义同时作用于阅读舞台内部的核心区域：EPUB 正文背景、正文外框卡片背景，以及正文外框外面的阅读舞台背景；不影响顶部栏、左侧目录和右侧工具栏。

## Scope

本次只调整阅读器中间舞台区域的配色链路：

- `reader-stage`
- `reader-viewport-shell`
- `epub-viewport`
- `epub-root`
- `reader-page-card`
- EPUB iframe 内 `body` 背景

不修改以下区域：

- `reader-topbar`
- `reader-left-rail`
- `reader-tools`
- 全局主题 `theme-*` 的系统色

## Design

### 1. Single source of truth

继续以 `settings.contentBackgroundColor` 作为唯一输入，不新增第二个“舞台背景色”设置项。

`ReaderPage` 继续通过 CSS 变量把该颜色下发到阅读器容器，但变量不再只用于 `.epub-root`，而是扩展成阅读舞台内部的统一底色来源。

### 2. Unified reading stage surface

阅读舞台内部不再使用当前那套固定的米色渐变作为主底色。改为：

- `reader-stage` 使用透明背景，负责布局，不负责视觉底色
- `reader-viewport-shell` 使用 `--reader-page-background`
- `epub-viewport` 使用 `--reader-page-background`
- `epub-root` 使用 `--reader-page-background`
- `reader-page-card` 使用 `--reader-page-background`

这样用户修改 `Page background` 后，看到的是一块完整一致的阅读区，而不是正文、外框、舞台分成多种底色。

### 3. Keep structure without a second color

为了保留“书页/卡片”的结构感，不再通过第二套背景色做层次，而是只靠这些非颜色手段：

- 边框
- 阴影
- 圆角
- 内外边距
- 少量透明叠层（如有必要）

即使保留轻微透明叠层，也必须以 `Page background` 为基底，不能回退到固定米色。

### 4. Responsive behavior

`paginated`、`scrolled`、桌面、平板都沿用同一配色逻辑，不单独分叉。

宽度变化只影响尺寸和布局，不影响背景色链路。用户在不同阅读模式下看到的阅读舞台应保持同一颜色语义。

## Error handling

- 不做自动颜色推导，不额外生成深浅变体
- 用户选择什么颜色，就直接作用到阅读舞台内部
- 极端颜色导致对比度下降属于用户主动选择，不在本次自动修正范围

## Testing

需要补两类回归：

1. 组件/页面测试
- `ReaderPage` 的样式变量仍正确输出 `contentBackgroundColor`
- 阅读舞台相关容器都使用统一背景变量

2. 偏好链路测试
- `buildReaderTheme()` 继续把同一颜色写进 EPUB iframe 的 `body`
- `AppearancePanel` / `SettingsDialog` 修改 `Page background` 后，舞台容器和正文背景同步变化

## Out of scope

- 顶部栏、目录栏、工具栏跟随 `Page background` 变色
- 自动生成层次色、边框色、对比色
- 新增第二个独立的“外框背景色”设置项
