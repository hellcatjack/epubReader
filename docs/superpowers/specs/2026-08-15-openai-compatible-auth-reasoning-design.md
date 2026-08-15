# OpenAI-Compatible Authentication And Reasoning Design

## Goal

Allow the browser reader to use authenticated OpenAI-compatible endpoints such as `https://ushome.amycat.com/openai/v1`, discover and select models through the authenticated endpoint, and configure reasoning effort for Explain requests.

## Scope

- Accept a base URL such as `/v1` as well as existing full `/chat/completions` and `/completions` URLs.
- Support an optional Bearer Token for the normal local/OpenAI-compatible endpoint.
- Support a separate optional Bearer Token for the Grammar LLM endpoint.
- Send authentication when discovering models and when making translation, definition, or explanation requests.
- Add Explain reasoning-effort choices: `Default`, `Low`, `Medium`, and `High`.
- Keep Gemini BYOK behavior unchanged.
- Store tokens only in the existing browser-local settings storage and refresh snapshot, matching current Gemini API-key handling.
- Do not hardcode the example endpoint or any token into source code.

## Endpoint Compatibility

The existing `resolveLlmApiEndpoints()` behavior remains the canonical URL resolver:

```text
https://ushome.amycat.com/openai/v1
  -> GET  https://ushome.amycat.com/openai/v1/models
  -> POST https://ushome.amycat.com/openai/v1/chat/completions
  -> POST https://ushome.amycat.com/openai/v1/completions
```

Explain and English definition use Chat Completions. Existing selection translation continues to use Completions so this change does not alter its prompt/output contract.

The example endpoint currently returns `403` with `code: "lan_only"` to an unauthenticated request from the development environment. Client support cannot bypass server-side LAN, CORS, or origin policy; the UI will report access failure while still allowing manual model entry.

## Configuration Model

Add these persisted fields:

```ts
type LlmReasoningEffort = "default" | "low" | "medium" | "high";

type SettingsRecord = {
  llmApiKey: string;
  grammarLlmApiKey: string;
  grammarLlmReasoningEffort: LlmReasoningEffort;
};
```

Defaults are empty tokens and `"default"` reasoning effort. Existing IndexedDB records migrate through the current default-settings merge.

Tokens are rendered as password inputs with autocomplete disabled. UI copy states that tokens are stored only in the current browser profile.

## Adapter And Routing

`createOpenAIAdapter()` receives two additional options:

```ts
type OpenAIAdapterDeps = {
  apiKey?: string;
  reasoningEffort?: LlmReasoningEffort;
};
```

Every OpenAI-compatible request builds headers through one helper:

```text
Content-Type: application/json
Authorization: Bearer <trimmed token>   # only when non-empty
```

For Explain requests:

- `default`: omit `reasoning_effort` and preserve the existing local-model option `chat_template_kwargs.enable_thinking = false`.
- `low`, `medium`, or `high`: send `reasoning_effort` with that value and omit `chat_template_kwargs`, avoiding a conflict between OpenAI-compatible reasoning controls and the existing local-model-specific switch.

For English definition and translation, reasoning effort is not sent.

`AiService` routing uses these rules:

1. Normal local translation uses `llmApiUrl`, `llmApiKey`, and `localLlmModel`.
2. Any Grammar override activates the local/OpenAI-compatible Explain adapter.
3. Blank Grammar URL, token, or model inherits the corresponding normal local setting.
4. Grammar reasoning effort is applied only to Explain.
5. If no Grammar override exists and the provider is Gemini, Explain continues through Gemini.

This also aligns implementation with existing UI text that blank Grammar fields reuse normal endpoint/model settings.

## Authenticated Model Discovery

`listLocalModels()` accepts an optional token and sends it to `GET /models`. `useLocalLlmModels()` accepts the token and reacts to endpoint/token changes.

To avoid one request per keystroke while entering a token, discovery waits 400 ms after the latest endpoint or token change and aborts the previous request when supported.

Discovery status communicates:

- loading: validating endpoint and loading models;
- ready: connection validated and models available;
- access failure (`401` or `403`): check token and endpoint/network policy;
- other failure: model loading failed, with manual model entry still available;
- blocked mixed-content access: preserve the existing secure-context warning.

Both normal-model and Grammar-model selectors use their corresponding token during discovery.

## User Interface

Add the same controls to the library Settings dialog and reader Appearance panel:

- `LLM API Token`, following the normal LLM API URL;
- `Grammar LLM API Token`, following the Grammar API URL;
- `Grammar reasoning effort`, following the Grammar model selector.

The existing model selector remains automatic when `/models` succeeds and falls back to manual model entry when discovery fails.

No token is displayed in status summaries, logs, errors, or model-discovery messages.

## Error Handling And Security

- Never send an `Authorization` header when the configured token is blank.
- Trim tokens before use without rewriting the stored user input.
- Treat `401` and `403` as access failures without echoing response bodies that could contain sensitive data.
- Preserve the current normalized AI error categories for completion requests.
- A model-discovery failure does not prevent saving settings or manually entering a model id.
- EPUB iframe script isolation remains unchanged; tokens stay in the outer application context.

## Testing

Add focused tests for:

1. endpoint resolution from the example `/v1` base URL;
2. Bearer Token on model discovery and all OpenAI-compatible request types;
3. no Authorization header for blank tokens;
4. model discovery reloading when token changes and reporting `401`/`403` access failures;
5. reasoning-effort payload behavior for `default`, `low`, `medium`, and `high`;
6. AiService normal and Grammar fallback routing with tokens and reasoning effort;
7. settings migration, persistence, and both settings surfaces;
8. no regression to Gemini routing or existing unauthenticated localhost usage.

Run focused test files, the complete Vitest suite, and the production build.

## Documentation

Update the AI/TTS implementation documentation or settings documentation to show the accepted URL forms, browser-local token storage, authenticated model discovery, reasoning-effort behavior, and the requirement that the remote service allow the browser origin and network location.
