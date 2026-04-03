# TTS Sentence Note Font Scale Design

## Goal

为“正在朗读句子的中文侧注”增加独立的字体大小设置，不影响正文、右侧工具栏或其他翻译结果区域。

## Scope

本次只修改以下链路：

- `SettingsInput` / `SettingsRecord`
- `settingsRepository` 默认值与迁移
- `SettingsDialog`
- `AppearancePanel`
- `ReaderPage` 下发样式变量
- `TtsSentenceTranslationNote` 消费字体比例

不修改：

- 正文 `fontScale`
- 普通翻译面板字体
- TTS 控制区字体

## Design

### 1. New independent setting

新增设置项：

- `ttsSentenceTranslationFontScale: number`

默认值：

- `1`

该值只控制“正在朗读句子的中文侧注”文本大小。

### 2. Shared settings pipeline

新设置沿用现有设置存储链路：

- 类型定义进入 `src/lib/types/settings.ts`
- 默认值与迁移进入 `src/features/settings/settingsRepository.ts`
- 全局 `SettingsDialog` 暴露输入框
- 阅读页 `AppearancePanel` 暴露输入框

### 3. Rendering strategy

`ReaderPage` 把该值下发成独立 CSS 变量，例如：

- `--reader-tts-sentence-note-font-scale`

`TtsSentenceTranslationNote` 组件不保留内部字号状态，只消费这个变量。

### 4. UI

设置项标签：

- `TTS note size`

交互形式：

- `type="number"`
- `min="0.85"`
- `max="1.6"`
- `step="0.05"`

放置位置：

- `SettingsDialog` 的排版/外观区域
- 阅读页 `AppearancePanel`

## Testing

需要覆盖：

1. 设置默认值与迁移
- 默认值为 `1`
- 旧 settings 记录迁移后能补上该值

2. UI 设置
- `SettingsDialog` 可编辑并持久化
- `AppearancePanel` 可编辑并回传 patch

3. 组件渲染
- `TtsSentenceTranslationNote` 使用该字体比例
- `ReaderPage` 在宽屏显示侧注时能把该比例传到样式变量

## Out of scope

- 预设档位（Small / Medium / Large）
- 跟随正文 `fontScale`
- 自动根据屏幕宽度推导侧注字号
