# OpenAI 兼容 API 配置与实现说明

本文说明 epubReader 如何接入带 Bearer Token 的 OpenAI 兼容接口、自动发现模型，以及为 Explain 语法解析设置思考程度。

## 支持的地址格式

`LLM API URL` 和 `Grammar LLM API URL` 均接受以下形式：

- API 根地址，例如 `https://ushome.amycat.com/openai/v1`
- Chat Completions 完整地址，例如 `https://example.com/v1/chat/completions`
- Completions 完整地址，例如 `https://example.com/v1/completions`

系统会统一解析成三个接口。以 `https://ushome.amycat.com/openai/v1` 为例：

| 功能 | 方法 | 最终地址 |
| --- | --- | --- |
| 模型发现和访问验证 | `GET` | `https://ushome.amycat.com/openai/v1/models` |
| Explain 语法解析 | `POST` | `https://ushome.amycat.com/openai/v1/chat/completions` |
| 英文释义 | `POST` | `https://ushome.amycat.com/openai/v1/chat/completions` |
| 选中文本翻译 | `POST` | `https://ushome.amycat.com/openai/v1/completions` |

因此，当前 Explain 使用的是 OpenAI 兼容的 **Chat Completions 接口**，不是 Responses API，也不是传统 Completions 接口。

## 设置方法

在项目 Settings 页面或阅读器右侧 Appearance 面板中，将 `Translation provider` 设为 `Local LLM`，然后配置：

1. `LLM API URL`：普通翻译及默认 Explain 使用的兼容接口地址。
2. `LLM API Token`：普通接口的 Bearer Token，可留空。
3. `Local LLM model`：从 `/models` 自动加载，也可在发现失败后手工输入模型 id。
4. `Grammar LLM API URL`：可选，仅用于 Explain 和英文释义；留空时继承普通地址。
5. `Grammar LLM API Token`：可选；留空时继承普通 token。
6. `Grammar LLM model`：可选；留空时继承普通模型。
7. `Grammar reasoning effort`：Explain 请求的思考程度。

设置页需要点击 `Save settings`。阅读器 Appearance 面板中的修改会立即写入本地设置。

## Token 认证和验证

非空 token 会先去除首尾空格，再作为以下请求头发送：

```http
Authorization: Bearer <token>
Content-Type: application/json
```

token 为空时不会发送 `Authorization` 请求头，因此原有的无认证 localhost 服务仍然可用。

输入或修改 endpoint/token 后，模型发现会等待 400ms，再请求 `GET /models`：

- 成功：说明当前浏览器可以访问接口，并填充模型选择列表。
- `401` 或 `403`：显示 token、地址或网络策略相关的访问错误，但不展示响应体和 token。
- 其他请求失败：允许继续保存设置，并切换为手工输入模型 id。
- endpoint/token 再次变化：取消上一条尚未完成的请求，避免逐字符重复验证。

这里的“验证”是通过经过认证的 `/models` 请求完成的，不会额外发送一次无业务意义的 token 校验请求。

## 模型选择

兼容服务的 `/models` 响应应至少包含 OpenAI 风格的 `data[].id`：

```json
{
  "data": [
    { "id": "reader-model" },
    { "id": "reasoning-model" }
  ]
}
```

系统会去重后显示这些模型 id。若服务不提供 `/models`、浏览器因混合内容策略不能访问，或验证失败，可以直接手工填写服务支持的模型 id。

## Explain 思考程度

`Grammar reasoning effort` 支持四个值：

| 设置 | Explain 请求体行为 |
| --- | --- |
| `Default` | 不发送 `reasoning_effort`，保留 `chat_template_kwargs.enable_thinking: false` |
| `Low` | 发送 `reasoning_effort: "low"`，不发送 `chat_template_kwargs` |
| `Medium` | 发送 `reasoning_effort: "medium"`，不发送 `chat_template_kwargs` |
| `High` | 发送 `reasoning_effort: "high"`，不发送 `chat_template_kwargs` |

思考程度只影响 Explain。普通翻译和英文释义不会发送 `reasoning_effort`。服务端或所选模型不支持该 OpenAI 兼容字段时，应使用 `Default`。

## Grammar 配置继承规则

Grammar 配置按字段独立继承：

- Grammar URL 为空：继承 `LLM API URL`。
- Grammar token 为空：继承 `LLM API Token`。
- Grammar model 为空：继承 `Local LLM model`。
- Grammar reasoning 为 `Default`：保持项目原有的非思考请求格式。

只要填写了任一 Grammar 专用值，Explain 就会使用 OpenAI 兼容适配器。完全没有 Grammar 覆盖时，Gemini provider 的 Explain 行为保持不变。

## 浏览器本地存储和安全边界

token 仅保存在当前浏览器配置中：持久设置使用 IndexedDB，页面刷新衔接快照使用当前标签页的 `sessionStorage`。输入框使用密码类型，状态摘要、错误消息和日志均不显示 token。

这些浏览器存储不是加密的服务端密钥库。共享电脑上不要保存高权限 token；需要清除时可使用项目的 `Reset local app data`，或清除该站点的浏览器数据。

请求由浏览器直接发送到配置的服务，不经过 epubReader 自有后端。远端服务必须自行满足：

- 允许当前网页来源的 CORS 请求。
- 允许 `Authorization` 和 `Content-Type` 请求头。
- 正确响应浏览器的 `OPTIONS` 预检请求。
- 允许当前网络位置、来源域名或客户端 IP 访问。
- HTTPS 页面调用远端服务时，远端也应使用 HTTPS；非 loopback 的 HTTP 私网地址会受到浏览器混合内容限制。

## `ushome.amycat.com` 的访问限制

开发环境直接请求示例地址的 `/models` 时，服务返回了 `403`，错误码为 `lan_only`。这表示服务端当前限制了网络位置。配置正确 token 后是否放行仍由该服务端决定；epubReader 无法绕过 LAN 白名单、IP 限制、CORS 或来源策略。

若仍然看到访问错误，应依次确认：

1. token 是否有效且具有模型列表和推理权限。
2. 当前电脑是否位于服务允许的局域网或 VPN 中。
3. 服务是否允许 epubReader 所在网页的 Origin。
4. `/models`、`/chat/completions` 和 `/completions` 是否全部由该兼容服务提供。
5. 所选模型是否支持请求的接口和 reasoning 参数。
