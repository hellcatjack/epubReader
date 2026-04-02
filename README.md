# EPUB 英语阅读器

这是一个面向中文用户的 EPUB 阅读器，目标是让英语阅读与听力练习更顺手、更连贯。

它把书籍正文、翻译、解释和朗读控制放在同一个界面里，减少在阅读器和翻译器之间来回切换的打断感，并借助 LLM 提高语境翻译的准确度。

这个项目主要希望帮助尝试学习英语阅读与听力的中国小伙伴，在尽量少打断节奏的前提下持续阅读、听书和理解上下文。

推荐使用 Microsoft Edge，可获得最佳听书体验，尤其是在英文自然语音、连续朗读和同步高亮方面。

![阅读器截图](docs/screenshots/reader-overview.png)

## 在线试用

在线试用环境：<https://epubreader-phi.vercel.app>

这是当前 GitHub 项目的公开试用环境，适合快速体验阅读器界面、EPUB 导入、翻译、解释和 TTS 相关功能。

需要注意的是，Vercel 试用环境更适合 `Gemini BYOK`。如果你在浏览器里把 `LLM API URL` 指向 `localhost` 或 `192.168.x.x` 这类本地或私网模型地址，浏览器可能会因为 mixed content、CORS 或本地网络访问限制而拦截请求。

## 为什么做这个项目

很多 EPUB 阅读器把翻译、解释和 TTS 当成互相分离的任务。对语言学习者来说，这会形成一个很糟糕的循环：

- 读一句
- 切去翻译器
- 再切回书
- 上下文断掉
- 重复这个过程

这个阅读器的目标就是尽量消除这条链路，让读者可以留在正文里完成阅读、翻译、解释和听书。

## 核心体验

- 在阅读页内直接翻译和解释，不需要离开当前页面
- 利用语境和 LLM 提高单词、多词短语与句子的翻译准确度
- 为桌面阅读设计的 TTS 控制与同步高亮，推荐在 Microsoft Edge 中获得最佳听书体验
- `Follow TTS playback` 可以在长时间听书时自动跟随当前位置：`paginated` 自动翻页，`scrolled` 按整屏阅读节奏推进
- 宽屏下，连续朗读时会在正文右侧留白显示当前正在朗读句子的中文翻译，不挤压正文，也不遮挡文字
- 同时支持 `paginated` 和 `scrolled` 两种阅读模式
- 本地优先的书签、笔记和高亮
- 可切换本地模型与 Gemini 在线翻译

## 开发

安装依赖并启动开发环境：

```bash
npm install
npm run dev
```

常用命令：

```bash
npm test
npm run e2e
npm run build
```

## AI 提供方

当前支持两种翻译 provider：

- `Local LLM`
- `Gemini BYOK`

这两种方式都可以在以下位置配置：

- 全局 `Settings`
- 阅读页右侧的 `Appearance` 面板

## 浏览器建议

推荐使用 Microsoft Edge 来获得最佳 TTS 听书体验。当前项目的朗读链路基于浏览器原生 `speechSynthesis`，而在桌面版 Edge 中，英文自然语音、连续朗读与高亮同步通常表现最好。

## TTS 跟随与圣经支持

- `Follow TTS playback` 默认关闭，适合希望页面保持静止的用户。
- 开启后，`paginated` 模式会在当前朗读内容进入下一页时自动翻页，而不是持续小幅滚动。
- 开启后，`scrolled` 模式会按整屏节奏推进，并保留顶部阅读缓冲，避免当前朗读行被顶出屏幕。
- 对圣经这类带大量小节编号和脚注编号的 EPUB，TTS 会自动忽略经文号与脚注号，减少朗读断裂感。
- 对像 ESV 这样正文与脚注位于同一超长文档内的书，自动翻页会优先保持正文与当前朗读段同步，不会把页面错误带到脚注总表。

### 正在朗读句子的中文侧注

- 仅在宽屏布局启用。
- 侧注贴在正文右侧留白，而不是右侧工具栏；如果正文右侧留白不够，就不会显示。
- 它用于帮助读者在听书时快速理解当前句子，不会改变正文列宽，也不会挡住正文内容。
- 平板与更窄的布局不会显示这块侧注，避免打断阅读。

### Local LLM

- 默认地址：`http://localhost:8001/v1/chat/completions`
- 支持填写：
  - `/v1`
  - `/v1/chat/completions`
  - `/v1/completions`
- 应用会自动规范化这些地址形式。
- 应用会自动请求 `/v1/models`，填充本地模型下拉菜单。
- 如果模型列表无法加载，请确认你的 OpenAI-compatible 服务暴露了 `GET /v1/models`，并且允许浏览器从当前页面来源访问。

### Gemini BYOK

- 界面当前支持：
  - `gemini-2.5-flash`
  - `gemini-2.5-flash-lite`
- 浏览器会直接使用你自己的 Gemini API key 发起请求。
- key 只保存在当前浏览器的本地设置中，不会打包进应用，也不应该提交到仓库。

## 如何申请 Gemini API Key

可以通过 Google AI Studio 申请：

1. 打开 [Google AI Studio](https://ai.google.dev/aistudio)。
2. 使用你的 Google 账号登录。
3. 点击 **Get API key**。
4. 在 AI Studio 的 API keys 页面创建新的 key。
5. 复制 key，并妥善保管，不要泄露。

官方参考文档：

- [Gemini API quickstart](https://ai.google.dev/gemini-api/docs/quickstart)
- [Using Gemini API keys](https://ai.google.dev/tutorials/setup)
- [Gemini API reference](https://ai.google.dev/api)

### 如何在本项目中使用

1. 打开 `Settings`，或者阅读页里的 `Appearance` 面板。
2. 将 `Translation provider` 切换为 `Gemini BYOK`。
3. 在 `Gemini API Key` 中粘贴你的 key。
4. 选择一个 Gemini model。
5. 如果你在全局设置里修改，记得保存。

### 安全说明

- 当前项目使用的是浏览器侧的 Gemini BYOK 方案。
- Google 官方更推荐服务端持有 key。当前方案更适合个人、自用或自托管环境，不适合面向公开用户的共享部署。
- 如果你不希望同一浏览器配置文件下的其他使用者访问这个 key，请不要在共享设备或共享浏览器配置中使用它。

### 配额、价格与排障

Gemini 免费额度、速率限制和价格会变化，不建议把固定数字写死在操作决策里。请以官方页面为准。

- [Pricing](https://ai.google.dev/pricing)
- [Quotas and rate limits](https://ai.google.dev/gemini-api/docs/quota)
- [Troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting)

如果 key 在 AI Studio 中可用，但在本项目里失败，请优先检查官方 troubleshooting 文档，并确认当前网络环境允许调用 Gemini API。

## 部署

前端以静态文件方式部署：

```bash
npm run build
rsync -a --delete dist/ /app/epubReader/
```

发布目录是 `/app/epubReader`。

### Vercel 部署

本项目可以直接部署到 Vercel Hobby。它本质上是一个 Vite 单页应用，构建产物就是 `dist/`。

当前公开试用地址：

- <https://epubreader-phi.vercel.app>

仓库已经包含 [vercel.json](/data/share/epubReader/vercel.json)，用于把所有前端路由 rewrite 到 `index.html`，避免刷新或直接访问 `/books/:bookId` 时出现 404。

推荐的 Vercel 项目设置：

- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`

如果你通过 Vercel Dashboard 导入 GitHub 仓库，通常会自动识别出这些设置；也可以直接在仓库根目录运行 `vercel` CLI 完成首次部署。

#### AI provider 建议

- 公开部署到 Vercel 时，更推荐使用 `Gemini BYOK`。
- `Local LLM` 仍然可以保留，但它依赖浏览器直接访问你填写的模型地址。
- 如果页面运行在 `https://<your-project>.vercel.app`，而本地模型地址是 `http://192.168.x.x:8001/...` 这类私网 HTTP 地址，浏览器通常会因为 mixed content、本地网络访问限制或 CORS 而拦截请求。
- 如果你需要在 Vercel 版本里继续使用本地模型，优先考虑：
  - `localhost` 形式的本机地址，仅用于你自己的浏览器环境
  - 或者给本地模型提供一个允许浏览器访问的 HTTPS 反向代理域名

#### PWA 与缓存

项目启用了 PWA 和自动更新。部署到 Vercel 后，已经打开很久的旧标签页仍可能短时间继续运行旧 bundle；如果页面行为和最新代码不一致，优先查看 `Settings` 中的 `Current build`，必要时刷新页面或使用 `Reset local app data`。

## 项目结构

- `src/app`: 应用外壳、路由和全局界面
- `src/features/bookshelf`: 书库导入和书架流程
- `src/features/reader`: 阅读器 UI、EPUB runtime、目录、批注和 TTS 集成
- `src/features/ai`: 翻译、解释和 endpoint 规范化
- `src/features/settings`: 阅读与 AI 配置持久化
- `tests/e2e`: Playwright 端到端测试
- `docs/`: 设计文档、计划和补充资料

## 隐私与仓库规范

- 不要把机器相关的 IP、私有域名或个人地址写进应用默认值、示例或测试。
- 本地手工测试用的 EPUB 文件应放在 `tests/fixtures/local/` 下，并保持 gitignored。
- 仓库根目录下的临时截图、草稿和 scratch 文件应保持 gitignored，避免误提交。
