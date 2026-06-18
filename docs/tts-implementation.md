# TTS 功能实现说明

本文整理当前项目中 TTS 的具体实现方式，重点说明连续朗读时正文上的朗读高亮如何生成、更新、清理和跟随视口。

## 结论概览

当前用户可见的 TTS 主链路是浏览器原生 Web Speech API：

- 通过 `window.speechSynthesis` 和 `SpeechSynthesisUtterance` 发声。
- 通过 `speechSynthesis.getVoices()` 发现并筛选英文语音。
- 通过 `SpeechSynthesisUtterance.onboundary` 获取朗读进度，再把进度映射成正文中的 active segment。
- 正文高亮不是 React 直接渲染，而是在 epub.js 渲染出的 iframe 文档内部临时插入或标记 DOM。
- `helper/windows-tts-helper` 仍在仓库中，但当前 `src/` 主应用没有调用该 localhost helper；它更像保留的辅助/历史实现。

核心数据流：

```text
TTS 控制面板
  -> ReaderPage.handleStartTts()
  -> RuntimeRenderHandle.getTtsBlocksFrom...
  -> chunkTextSegmentsFromBlocks()
  -> createTtsQueue().start()
  -> browserTtsClient.speakSelection()
  -> SpeechSynthesisUtterance.onboundary
  -> TtsQueueState.markerText / markerCfi / marker offsets
  -> ReaderPage.activeContinuousTtsSegment
  -> EpubViewport.setActiveTtsSegment()
  -> epubRuntime.applyActiveTtsSegment()
  -> iframe DOM 中的 .reader-tts-active-segment
```

## 关键文件

| 文件 | 职责 |
| --- | --- |
| `src/features/tts/browserTtsClient.ts` | 浏览器 TTS 封装，负责语音发现、排序、创建 utterance、转发 start/boundary/end/error 事件，以及 pause/resume/stop。 |
| `src/features/tts/useTtsScreenWakeLock.ts` | 连续朗读期间的 Screen Wake Lock hook，负责在 TTS 活跃时让屏幕保持常亮，并在暂停/停止/页面隐藏时释放。 |
| `src/features/tts/ttsQueue.ts` | 连续朗读队列，按 chunk 串行发声，并把 boundary 的 `charIndex` 转换成当前 marker、当前词和正文 source offsets。 |
| `src/features/tts/chunkText.ts` | 将正文块拆成适合 TTS 的 `ChunkSegment`，保留 CFI、spine、locatorText、sourceStart/sourceEnd 等回正文定位信息。 |
| `src/features/reader/ReaderPage.tsx` | TTS 编排层：抽取正文、启动/暂停/继续/停止队列、维护 `ttsState`、生成 active segment、处理设置和翻译侧注。 |
| `src/features/reader/EpubViewport.tsx` | React 到 epub runtime 的桥接层，把 `activeTtsSegment` 和 `ttsFollowPlayback` 转发给 runtime handle。 |
| `src/features/reader/epubRuntime.ts` | epub.js 集成层，负责从 iframe 文档抽取 TTS blocks、定位 active segment、插入高亮 DOM、跟随滚动/翻页。 |
| `src/features/reader/readerPreferences.ts` | 注入 epub iframe 的阅读主题，其中包含 `.reader-tts-active-segment` 样式。 |
| `src/features/reader/panels/TtsStatusPanel.tsx` | TTS 控制面板 UI。 |
| `src/features/reader/ttsSentenceTranslation.ts` 和 `TtsSentenceTranslationNote.tsx` | 当前朗读句子的中文侧注逻辑和展示组件。 |
| `src/lib/types/settings.ts`、`src/features/settings/settingsRepository.ts` | TTS 相关设置类型、默认值、迁移与持久化。 |
| `helper/windows-tts-helper/` | Windows WinRT localhost TTS helper，当前不在主应用 TTS 路径中使用。 |

## 浏览器 TTS 客户端

`createBrowserTtsClient()` 是主应用唯一直接封装 Web Speech API 的位置。

### 语音发现

`getVoices()` 的流程：

1. 调用 `speechSynthesis.getVoices()`。
2. 如果立即没有返回语音，则监听 `voiceschanged`。
3. 只保留 `lang` 以 `en` 开头的语音。
4. 排序优先级为：
   - 英文语音优先；
   - 名称包含 `natural` 的语音优先；
   - 浏览器默认语音优先。
5. 输出统一的 `BrowserTtsVoice`：
   - `id`
   - `displayName`
   - `locale`
   - `gender`
   - `isDefault`

`gender` 是通过语音名称的关键词粗略推断，例如 `ava`、`jenny` 归为 female，`andrew`、`david` 归为 male，否则为 unknown。

### 发声

`speakSelection(text, options)` 同时服务于“选中文本朗读”和“连续朗读队列中的单个 chunk”：

1. 创建 `SpeechSynthesisUtterance(text)`。
2. 根据 `voiceId` 匹配浏览器语音，找不到则回退到第一条语音。
3. 设置 `utterance.rate`、`utterance.volume`、`utterance.voice`。
4. 绑定事件：
   - `onstart` -> `options.onStart`
   - `onboundary` -> `options.onBoundary`
   - `onend` -> `options.onEnd`
   - `onerror` -> `options.onError`
5. 先调用 `speechSynthesis.cancel()` 清掉当前浏览器队列，再调用 `speechSynthesis.speak(utterance)`。

`pause()`、`resume()`、`stop()` 分别透传到 `speechSynthesis.pause()`、`speechSynthesis.resume()`、`speechSynthesis.cancel()`。

## 文本抽取与分块

连续朗读不是直接读取整章纯文本。优先路径是由 runtime 从当前 epub iframe 中抽取结构化的 `RuntimeTtsBlock[]`，再转成 `ChunkSegment[]`。

### RuntimeTtsBlock

`RuntimeTtsBlock` 是从正文块级节点抽出来的结构：

```ts
type RuntimeTtsBlock = {
  cfi?: string;
  locatorText?: string;
  sourceEnd?: number;
  sourceStart?: number;
  spineItemId: string;
  tagName?: string;
  text: string;
};
```

它的关键点：

- `text` 是实际用于朗读的文本。
- `locatorText` 是原始块文本，作为定位 fallback。
- `cfi` 用于回到 epub 文档中的块位置。
- `sourceStart/sourceEnd` 是该朗读文本在块级“规范化 TTS 文本”中的偏移。
- `spineItemId` 用于避免把上一章/下一章的高亮错误应用到当前 iframe。
- `tagName` 用于识别标题，给标题和正文之间加入停顿。

### 可朗读块选择

runtime 使用固定选择器：

```ts
const ttsBlockSelector = "p, li, blockquote, h1, h2, h3, h4, h5, h6";
```

连续朗读起点可能来自：

- 当前可见位置：`getTtsBlocksFromCurrentLocation()`
- 当前选择：`getTtsBlocksFromCurrentSelection()`
- 选择起点 CFI：`getTtsBlocksFromSelectionStart(cfiRange)`
- 目录/刷新恢复目标：`getTtsBlocksFromTarget(target)`

如果结构化 blocks 抽取失败，`ReaderPage` 会回退到 `getTextFromCurrentLocation()`，再用纯文本分块。这种 fallback 能朗读，但高亮定位信息会少很多。

### 忽略经文号和脚注号

`epubRuntime.ts` 中的 TTS 文本规范化会跳过可省略元素：

- 纯数字、`[1]`、`1:1` 等 marker 文本；
- `sup`；
- 指向脚注的 `sup > a`；
- 类似 `id="v01001001"` 的经文号 `b` 元素。

因此 `extractTtsBlockText()` 生成朗读文本和高亮偏移时，会把经文号/脚注号排除在外。这样能避免圣经类 EPUB 朗读出小节号，也避免高亮偏移被这些 DOM 节点污染。

### ChunkSegment

`chunkTextSegmentsFromBlocks()` 输出：

```ts
type ChunkSegment = {
  markers: ChunkMarker[];
  pauseAfterMs?: number;
  text: string;
};
```

`text` 是本次 utterance 发声的完整文本，`markers` 是它内部可定位回正文的子段：

```ts
type ChunkMarker = {
  cfi?: string;
  end: number;
  locatorText?: string;
  spineItemId?: string;
  start: number;
  sourceEnd?: number;
  sourceStart?: number;
  text: string;
};
```

其中有两套偏移：

- `start/end`：marker 在当前 utterance 文本 `chunk.text` 里的偏移，用来根据 `onboundary.charIndex` 判断当前说到哪个 marker。
- `sourceStart/sourceEnd`：marker 在原始正文块的规范化 TTS 文本里的偏移，用来在 iframe DOM 中精确创建 Range。

分块策略：

- 第一段最大 `firstSegmentMax = 280`，让首次出声更快。
- 后续段最大 `segmentMax = 500`，减少过度切片。
- 短段落会合并。
- 超长段落会按句子切；句子仍超长时按词切。
- 标题块独立处理；标题后若还有内容，会通过 `pauseAfterMs = 350` 加一个短停顿。
- paginated 模式下如果打开 `Follow TTS playback`，正文 chunk 会拆成 single-marker chunk，便于按段/页稳定跟随。

## 连续朗读队列

`createTtsQueue()` 管理连续朗读。它不自己发声，而是持有一个 `client`，实际发声仍走 `browserTtsClient.speakSelection()`。

### 队列状态

`TtsQueueState`：

```ts
type TtsQueueState = {
  chunkIndex: number;
  currentText: string;
  markerCfi: string;
  markerEndOffset: number;
  markerIndex: number;
  markerLocatorText: string;
  markerStartOffset: number;
  markerText: string;
  status: "idle" | "loading" | "playing" | "paused" | "error";
};
```

这份状态会通过 `onStateChange` 写回 `ReaderPage.ttsState`。正文高亮真正依赖的是：

- `markerText`
- `markerCfi`
- `markerLocatorText`
- `markerStartOffset`
- `markerEndOffset`
- `markerIndex`

### boundary 到 marker 的转换

浏览器触发 `SpeechSynthesisUtterance.onboundary` 时，会传入 `SpeechSynthesisEvent`，其中最重要的是 `charIndex`。

队列处理过程：

1. 忽略非 word boundary。`event.name` 为空或为 `word` 才处理；例如 sentence boundary 会被跳过。
2. 根据 `charIndex` 在当前 `chunk.markers` 中查找：
   - `marker.start <= charIndex <= marker.end`
3. 找到当前 marker 后，在 marker 文本内部继续解析当前单词：
   - 如果 `charIndex` 落在空白或标点上，会向前/向后寻找最近的可朗读 token 字符。
   - token 字符包括字母、数字、撇号和连字符类字符。
4. 输出更细的 `markerText`：
   - 常见情况是当前正在朗读的单词；
   - 如果无法解析单词，则退回 marker 文本。
5. 如果 marker 有 `sourceStart/sourceEnd`，把当前单词在 marker 内的偏移加上 `sourceStart`，生成 `markerStartOffset/markerEndOffset`。

这个设计让高亮可以从“当前段落”细化到“当前单词”，尤其是 paginated 模式和 Edge word boundary 支持较好时。

### 初始高亮 fallback

不同浏览器的 boundary 事件并不稳定。队列对此做了两层 fallback：

- 如果当前 chunk 只映射到同一个高亮目标，`onstart` 时立即显示初始 marker。
- 如果一个 chunk 跨多个目标，先等 boundary；如果浏览器迟迟不发 boundary，则在 `initialMarkerFallbackMs` 后显示第一个 marker。

默认 fallback 是 `250ms`。paginated 模式中 `ReaderPage` 传入 `700ms`，避免翻页场景里过早显示错误位置。

### 结束、错误、暂停

- `onend` 后按 `pauseAfterMs` 等待，再进入下一个 chunk。
- 最后一个 chunk 结束后进入 `idle`。
- `onerror` 或 `speakSelection()` 抛错时进入 `error`，并保留尽量多的 marker 信息，便于 UI 和高亮状态稳定。
- `pause()` 只在 playing 时生效，调用浏览器 pause 并把状态置为 paused。
- `resume()` 从 paused 回到 playing。
- `stop()` 增加 `runId` 让旧异步回调失效，取消浏览器语音并清空状态。

## ReaderPage 编排

`ReaderPage.tsx` 是 TTS 的业务编排层。

### 初始化和就绪判断

当 `runtimeHandle`、当前位置或语音设置变化时，页面会并行检查：

- 当前阅读位置是否能抽取到可朗读 chunks；
- 浏览器是否能返回英文 TTS voices。

结果决定 `Start TTS` 是否可用：

- 没有 voices：`No compatible English voices detected.`
- `speechSynthesis` 不可用：`Browser speech synthesis unavailable.`
- 没有 chunks：禁用开始按钮。
- voices 和 chunks 都可用：`ttsStartReady = true`。

### Start TTS 的优先级

点击 `Start TTS` 后，起点选择有优先级：

1. 当前 live runtime selection。
2. selection bridge 中的选择。
3. React state 中的选择。
4. pointer down 时预抓取的 selection blocks。
5. 最近释放过、但已被焦点清理掉的 selection。
6. 刷新或目录跳转记录下来的 pending start target。
7. 当前阅读位置。

这样处理是为了解决 iframe selection 很容易在按钮点击、焦点切换或移动端手势中丢失的问题。

如果本次启动来自选择，成功构造 chunks 后会：

- 清除 iframe selection；
- 清空 selection bridge；
- 重置 selection 相关缓存；
- 从选择起点继续连续朗读，而不是只朗读选中文本。

### startContinuousQueue()

启动连续朗读时：

1. 记录当前连续朗读的 `spineItemId`。
2. 保存 `continuousChunksRef`，后续调速或跨章续读会用到。
3. 停止任何 selection speech。
4. 初始化 `ttsState` 为 loading，并填入第一个 marker。
5. 调用 `ensureTtsQueue().start()`，传入 rate、voiceId、volume，以及 paginated 初始高亮 fallback。

队列状态每次变化都会回填到 `ttsState`。

### activeContinuousTtsSegment

`ReaderPage` 通过 `useMemo` 把 `ttsState` 转成传给 viewport 的 active segment：

```ts
{
  cfi: ttsState.markerCfi || undefined,
  locatorText: ttsState.markerLocatorText || undefined,
  spineItemId: continuousSpineItemIdRef.current,
  text: ttsState.markerText,
  startOffset: ttsState.markerStartOffset,
  endOffset: ttsState.markerEndOffset,
}
```

只有满足以下条件才会生成：

- 当前模式是 continuous；
- 状态不是 idle；
- 有 `markerText`；
- 有连续朗读的 `spineItemId`。

它随后作为 `activeTtsSegment` prop 传给 `EpubViewport`。

### 调速

修改 TTS rate 时：

- selection speech：直接用当前文本重新启动。
- continuous speech：从当前 `chunkIndex` 和 `markerIndex` 切出剩余 chunks，然后用新 rate 重新启动队列。

这样可以避免从章节开头重读。

### 跨章续读

当队列结束进入 idle，但 `continuousSessionActiveRef` 仍为 true 时：

1. 记录最后 spoken text 和 marker CFI。
2. 如果有最后 marker CFI，先 `runtimeHandle.goTo(previousMarkerCfi)`。
3. 调用 `runtimeHandle.next()`。
4. 从新位置重新抽取 chunks。
5. 如果确认位置确实前进，则再次 `startContinuousQueue()`。

如果用户手动跳到不同 spine，且它不是 TTS 自己等待同步的 spine，当前连续朗读会停止并清空。

## EpubViewport 桥接

`EpubViewport` 只做桥接，不自己计算高亮：

- runtime render 完成后调用：
  - `handle.setTtsPlaybackFollow(ttsFollowPlayback)`
  - `handle.setActiveTtsSegment(activeTtsSegmentRef.current)`
- `activeTtsSegment` prop 变化时，调用 `runtimeHandle.setActiveTtsSegment(activeTtsSegment)`。
- `ttsFollowPlayback` prop 变化时，调用 `runtimeHandle.setTtsPlaybackFollow(ttsFollowPlayback)`。
- `.epub-root` 上设置 `data-tts-active="true|false"`，用于外层容器视觉状态。

## 正文朗读高亮实现

正文高亮的核心在 `epubRuntime.ts` 的 `applyActiveTtsSegment()`。

### 输入

输入是 `ActiveTtsSegment`：

```ts
type ActiveTtsSegment = {
  cfi?: string;
  endOffset?: number;
  locatorText?: string;
  spineItemId: string;
  startOffset?: number;
  text: string;
};
```

字段来源：

- `text`：来自队列解析后的当前单词或 marker。
- `cfi`：marker 所属正文块的 CFI。
- `locatorText`：原始正文块文本，用于定位 fallback。
- `startOffset/endOffset`：当前朗读词在正文块规范化 TTS 文本里的位置。
- `spineItemId`：防止跨 spine 错误高亮。

### 清理旧高亮

每次应用新 segment 前都会调用 `clearActiveTtsSegment()`：

- 如果旧高亮是 runtime 插入的 `span.reader-tts-active-segment`：
  - 把 span 的子节点移回父节点；
  - 移除 span；
  - 对父节点 `normalize()` 合并相邻文本节点。
- 如果旧高亮只是给块级元素加 class：
  - 移除 `reader-tts-active-segment` class。
- 将 `activeTtsElement = null`。

这一步很重要，因为连续 boundary 会频繁移动高亮，必须保证不会在 EPUB DOM 中累积 span。

### spine 防护

如果 segment 的 `spineItemId` 和当前 iframe 的 `currentSpineItemId` 不一致，直接返回，不做 DOM 操作。

这避免连续朗读跨章、翻页或 runtime 尚未同步时，把下一章的高亮插到上一章 iframe。

### 定位目标块

`findSegmentElement(contents, segment)` 按以下顺序找块级元素：

1. 如果有 `segment.cfi`：
   - 先用当前 contents 的 `contents.range(segment.cfi)`。
   - 失败后用 book 级 `book.getRange(segment.cfi)`。
   - 从 range 的 startContainer 向上找最近的 TTS block。
2. 如果 CFI 失败且有 `segment.locatorText`：
   - 用 `findTtsBlockElementByText(body, locatorText)`。
3. 最后用 `segment.text` 做文本查找。

`findTtsBlockElementByText()` 会遍历 `ttsBlockSelector` 对应的块，比较 `extractTtsBlockText(candidate)`：

- 完全匹配；
- segment 包含 candidate 文本；
- 或前 120 个字符的 prefix 匹配。

如果找不到元素，会在同一个 segment 仍然有效时最多重试 4 次，每次间隔 120ms。这是为了等待 epub.js layout 或翻页后的 DOM 稳定。

### 精确 Range 定位

找到块级元素后，runtime 尝试用 `findTtsSegmentTextRange(nextElement, segment.text, segment.startOffset, segment.endOffset)` 创建精确 Range。

流程：

1. 对块级元素调用 `collectNormalizedTtsText()`：
   - 遍历所有文本节点；
   - 跳过经文号/脚注等 omittable 元素；
   - 把连续空白压成一个空格；
   - 生成规范化字符串；
   - 同时记录规范化字符到原始 Text node offset 的映射。
2. 如果 `startOffset/endOffset` 有效，优先直接用偏移定位。
3. 如果没有 offsets，则在规范化字符串中 `indexOf(segment.text)`。
4. 根据位置映射创建 DOM `Range`。

偏移优先是解决重复词的关键。例如同一段里有多个 `alpha`，只靠文本搜索会命中第一个；有 offsets 时可以精确命中当前 boundary 对应的那个词。

### 插入高亮 DOM

如果拿到了 `preciseRange`：

```ts
const wrapper = nextElement.ownerDocument.createElement("span");
wrapper.className = "reader-tts-active-segment";
const contents = preciseRange.extractContents();
wrapper.append(contents);
preciseRange.insertNode(wrapper);
activeTtsElement = wrapper;
```

也就是把当前 Range 的内容抽出，包进一个临时 span，再插回原位置。

如果拿不到精确 Range：

```ts
nextElement.classList.add("reader-tts-active-segment");
activeTtsElement = nextElement;
```

也就是降级高亮整个段落/标题/list item。

### 高亮样式

`.reader-tts-active-segment` 样式不是在 `reader.css` 中直接作用于 iframe，而是在 `readerPreferences.ts` 的 `buildReaderTheme()` 中通过 epub.js rendition theme 注入到 EPUB 内容文档：

```ts
".reader-tts-active-segment": {
  "background": "linear-gradient(90deg, rgba(186, 106, 47, 0.16) 0, rgba(186, 106, 47, 0.16) 100%)",
  "background-repeat": "no-repeat",
  "border-radius": "0.45rem",
  "box-shadow": "inset 0 0 0 1px rgba(186, 106, 47, 0.24)",
  "padding-left": "0",
  "scroll-margin-top": "18vh",
  "transition": "none",
}
```

外层 `.epub-root[data-tts-active="true"]` 在 `reader.css` 中提供容器级视觉反馈，但正文中的词/段高亮来自 iframe 内的 `.reader-tts-active-segment`。

### 高亮生命周期

一次连续朗读高亮生命周期：

1. `Start TTS` 后队列进入 loading。
2. `onstart` 或 `onboundary` 使 `ttsState.markerText` 有值。
3. `ReaderPage` 生成 `activeContinuousTtsSegment`。
4. `EpubViewport` 调 runtime `setActiveTtsSegment()`。
5. runtime 清理旧高亮。
6. runtime 定位块和精确 Range。
7. runtime 插入 `span.reader-tts-active-segment` 或给块元素加 class。
8. 下一个 boundary 到来时重复 5-7。
9. stop、idle、跨 spine 或组件卸载时，active segment 变为 null 或 runtime destroy，旧高亮被清掉。

## Follow TTS playback

`Follow TTS playback` 默认关闭。关闭时，runtime 仍然移动正文高亮，但不会为了高亮改变滚动或翻页位置。

开启后，`applyActiveTtsSegment()` 在插入高亮后会读取高亮 rect 并决定是否跟随。

### Scrolled 模式

scrolled 模式使用 iframe rect、容器 rect 和高亮 rect 计算高亮相对于滚动容器的位置。

逻辑：

- 高亮在当前视口上方：需要回滚。
- 高亮进入底部可读区域之外：需要向下推进。
- 推进距离约为“一屏减去顶部阅读缓冲和一行高度”，避免逐行抖动。
- 如果高亮仍在当前屏幕舒适区域内，则不移动。

`resolveScrolledFollowScrollTop()` 会循环计算，直到目标高亮回到合适的屏幕区域。

### Paginated 模式

paginated 模式用高亮 rect 的 left/right 和页面宽度计算它所在的 page index：

- 如果当前 page index 已覆盖高亮范围，不动。
- 如果高亮进入后面的列/page，设置容器到目标 page index。
- 翻页后等待 paginated container settle，再重新应用 active segment，确保高亮在新页面 DOM/布局下仍正确。

为了让 paginated 跟随更稳定，开启 follow 后正文 blocks 会拆成 single-marker chunks，让每次 utterance 更接近一个可翻页定位单元。

### 无 boundary 的 fallback

某些浏览器或语音不会发 word boundary。队列的初始 marker fallback 会让第一段高亮仍能出现。paginated follow 下，即使没有 boundary，也可以在 chunk 结束和下一 chunk 开始时推进页面。

## 选中文本朗读

选中文本的 `Read aloud` 不是连续队列：

- 调用 `startSelectionSpeech(text)`。
- 停止连续朗读队列。
- 清空 continuous refs。
- 直接调用 `browserTtsClient.speakSelection(nextText, options)`。
- `ttsState.mode = "selection"`。
- start/end/error 只更新状态和当前文本，不生成 `activeContinuousTtsSegment`。

因此“选中文本朗读”不会在正文中生成连续朗读那套 active segment 高亮。正文高亮重点服务于 `Start TTS` 连续朗读。

另外，项目中还有选择后自动翻译/自动短朗读逻辑：

- 选择文本需要含字母或数字；
- 自动朗读有英文字符数阈值；
- 翻译失败不阻断 TTS，TTS 失败也不阻断翻译。

## 正在朗读句子的中文侧注

中文侧注是连续朗读的附加功能，依赖同一个 active segment。

### 当前句子提取

`ReaderPage` 用 `extractCurrentSpokenSentence()` 从以下信息提取当前句子：

- `fallbackText`：当前 utterance 文本；
- `locatorText`：当前正文块完整文本；
- `startOffset`：当前单词在正文块中的偏移。

如果句子为空或只是数字/脚注号，会被忽略。

### 翻译请求和缓存

缓存 key：

```text
bookId::spineItemId::normalizedSentence
```

如果缓存没有命中，则调用 `ai.translateSelection(currentSpokenSentence, { targetLanguage })`。请求用递增版本号防止过期结果覆盖当前句子。

### 侧注定位

runtime 暴露 `getTtsSentenceNoteMetrics()`：

- 读取当前 `activeTtsElement.getBoundingClientRect()`；
- 找到最近的 TTS block 作为阅读块；
- 把 iframe 内 rect 投影到外层 viewport；
- 返回 `activeRect` 和 `readingRect`。

`ReaderPage` 再用 `resolveTtsSentenceNotePlacement()` 计算侧注位置：

- 宽度最多 600px；
- 水平尽量以阅读块中心为准；
- 垂直优先放在 active text 上方，空间不足时放下方；
- 在 tablet 布局中也保持相同的定位逻辑和稳定宽度。

最终由 `TtsSentenceTranslationNote` 渲染一个绝对定位的 `aside.reader-tts-sentence-note`。

## TTS 设置

设置字段：

- `ttsRate: number`，默认 `1`。
- `ttsVoice: string`，默认空，首次发现 voices 后自动回退到默认/第一条语音。
- `ttsVolume: number`，默认 `1`。
- `ttsFollowPlayback: boolean`，默认 `false`。
- `ttsSentenceTranslationEnabled: boolean`，默认 `false`。
- `ttsSentenceTranslationFontScale: number`，默认 `1`。

保存位置：

- `saveSettings()` 写入 IndexedDB 的 `settings` 记录。
- `getResolvedSettings()` 会合并默认值和迁移结果。
- legacy voice 值如 `Ryan`、`disabled`、`system-default`、`af_*`、`am_*` 会迁移为空，交给浏览器语音发现重新选择。

UI 入口：

- `TtsStatusPanel` 的 `TTS queue` 面板提供 Start/Pause/Resume/Stop。
- Advanced 控制里提供：
  - Follow TTS playback；
  - Show TTS translation note；
  - Voice；
  - Rate；
  - Volume；
  - 0.8x / 1.0x / 1.2x / 1.4x 快捷速率。

## 听书时屏幕常亮

连续 TTS 还接入了浏览器标准的 Screen Wake Lock：

- hook：`src/features/tts/useTtsScreenWakeLock.ts`
- 接入点：`ReaderPage` 根据连续 TTS 状态计算 `shouldKeepScreenAwakeForTts`
- 触发条件：`ttsState.mode === "continuous"` 且状态为 `loading` 或 `playing`
- 释放条件：暂停、停止、自然结束、报错、页面卸载或页面变为不可见
- 恢复条件：页面重新可见且连续 TTS 仍处于活跃状态时重新申请

实现方式是调用：

```ts
await navigator.wakeLock.request("screen");
```

该能力只负责让屏幕保持常亮，不承诺在 Edge 最小化、页面不可见、锁屏或系统省电策略拒绝时继续阻止 Win11 睡眠。申请失败会被吞掉，不影响 TTS 继续朗读。

## 错误和降级

常见错误路径：

- `speechSynthesis` 不存在：显示 `Browser speech synthesis unavailable.`
- 没有英文 voices：显示 `No compatible English voices detected.`
- 当前没有可朗读文本：显示 `No readable text is available from the current location.`
- `navigator.wakeLock` 不存在或系统拒绝：屏幕常亮失效，但不会阻断朗读。
- utterance error：显示 `TTS failed: ...`
- 阅读位置手动跳到不同 spine：停止连续朗读，状态回 idle，并记录 `Reading position changed.`

结构化 blocks 抽取失败时，连续朗读会退回到扁平正文文本；这保证能继续朗读，但正文精确高亮能力会下降，因为没有 CFI 和 source offsets。

## Windows TTS Helper

`helper/windows-tts-helper` 是一个 .NET helper：

- 绑定 `http://127.0.0.1:43115`。
- `GET /health` 返回 helper 状态、版本、backend 和 voiceCount。
- `GET /voices` 返回 Windows WinRT voices。
- `POST /speak` 接收 text、voiceId、rate、volume、format，并返回 `audio/wav`。
- 使用 WinRT `Windows.Media.SpeechSynthesis`。
- CORS 允许 localhost、loopback 和私有 LAN origin。
- 非 Windows 主机上 `/voices` 可返回空，`/speak` 不支持。

但当前前端主应用已经切到浏览器原生 `speechSynthesis`。`src/` 中没有对 `127.0.0.1:43115`、`/speak` 或 helper client 的调用；README 也说明当前朗读链路基于浏览器原生 `speechSynthesis`。

## 测试覆盖

主要测试点：

- `src/features/tts/browserTtsClient.test.ts`
  - voices 加载和排序；
  - `speechSynthesis` 不可用时报错；
  - utterance 使用指定 voice/rate/volume；
  - start 事件转发。
- `src/features/tts/ttsQueue.test.ts`
  - chunk 串行推进；
  - chunk 之间的 pause；
  - error、pause、resume、stop；
  - boundary 更新 marker；
  - 当前词级高亮；
  - 忽略 sentence boundary；
  - 多 marker chunk 等 boundary 后再暴露高亮；
  - 无 boundary 时 fallback；
  - 没有 source offsets 时不输出块内 offsets。
- `src/features/tts/chunkText.test.ts`
  - 段落合并；
  - first segment 更短；
  - 超长段落按句子/词切；
  - 保留 source offsets；
  - 从段落中部选择开始时仍保留原始块偏移。
- `src/features/reader/epubRuntime.test.ts`
  - TTS block 可见性和起点；
  - 跳过圣经经文号/脚注号；
  - 精确文本 Range；
  - 重复词 offsets；
  - follow playback 的 scrolled/paginated 判定；
  - 侧注 rect 投影和阅读块 rect。
- `src/features/reader/ReaderPage.test.tsx`
  - active segment 传给 viewport；
  - boundary 推进时 marker 移动；
  - rate 修改后从当前 marker 重启；
  - 不在 ReaderPage 层强制 paginated `goTo`；
  - 跨章连续朗读；
  - 选择起点朗读；
  - TTS 设置持久化；
  - Start TTS 就绪状态。
- `tests/e2e/local-tts.spec.ts`
  - 选择朗读和连续控制；
  - iframe 中 `.reader-tts-active-segment` 出现；
  - paginated 模式段落对齐；
  - scrolled 模式关闭 follow 时不滚动；
  - scrolled follow 按整屏推进；
  - paginated follow 自动翻页；
  - 无 boundary 的 paginated fallback；
  - boundary 时精确高亮当前词；
  - 重复词和后续段落的高亮稳定性。
- `tests/e2e/bible-toc.spec.ts`、`tests/e2e/bible-local-tts.spec.ts`
  - 圣经 EPUB 跳过经文号和脚注号；
  - 标题独立 utterance 和停顿；
  - paginated follow 不漂移到脚注总表；
  - 中文侧注相对当前阅读块居中。

## 排查建议

如果正文高亮不出现，优先检查：

1. `ttsState.mode/status/markerText` 是否满足生成 `activeContinuousTtsSegment` 的条件。
2. `continuousSpineItemIdRef.current` 是否为空或与当前 spine 不一致。
3. `RuntimeTtsBlock` 是否带有有效 `cfi`、`locatorText`、`sourceStart/sourceEnd`。
4. 浏览器是否发出了 `onstart` 或 `onboundary`；如果没有，等待 fallback 是否触发。
5. iframe 文档里是否能查询到 `.reader-tts-active-segment`。
6. `findTtsSegmentTextRange()` 是否因为文本规范化、重复词、脚注节点或 offsets 缺失而失败。
7. 是否 fallback 到了 `getTextFromCurrentLocation()`，导致只剩纯文本 chunk，无法精确定位正文。
8. paginated 模式下是否正在等待翻页 settle 和重试应用 active segment。

如果高亮位置不准，重点看：

- `extractTtsBlockText()` 的规范化文本是否和 chunk marker 的 `locatorText/text` 一致；
- `sourceStart/sourceEnd` 是否基于同一份规范化文本；
- boundary `charIndex` 是否指向 word boundary；
- 浏览器是否只发 sentence boundary；
- 目标段落中是否有重复词且 offsets 丢失。
