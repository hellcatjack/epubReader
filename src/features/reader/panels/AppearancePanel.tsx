import type { TranslationProvider } from "../../../lib/types/settings";
import { geminiModelOptions, translationProviderOptions } from "../../ai/providerOptions";
import { useLocalLlmModels } from "../../ai/useLocalLlmModels";
import type { ReaderPreferences } from "../readerPreferences";

type AppearancePanelProps = {
  apiKey?: string;
  geminiModel?: string;
  grammarLlmApiUrl?: string;
  grammarLlmModel?: string;
  llmApiUrl?: string;
  localLlmModel?: string;
  onApiKeyChange?: (value: string) => void;
  onChange?: (patch: Partial<ReaderPreferences>) => void;
  onGeminiModelChange?: (value: string) => void;
  onGrammarLlmApiUrlChange?: (value: string) => void;
  onGrammarLlmModelChange?: (value: string) => void;
  onLlmApiUrlChange?: (value: string) => void;
  onLocalLlmModelChange?: (value: string) => void;
  onTranslationProviderChange?: (value: TranslationProvider) => void;
  preferences: ReaderPreferences;
  translationProvider?: TranslationProvider;
};

function parseNumericPatch(
  value: string,
  onChange: ((patch: Partial<ReaderPreferences>) => void) | undefined,
  field: keyof ReaderPreferences,
) {
  const nextValue = Number(value);

  if (Number.isFinite(nextValue)) {
    onChange?.({ [field]: nextValue } as Partial<ReaderPreferences>);
  }
}

function mergeModelOptions(currentValue: string, fetchedModels: string[]) {
  return currentValue && !fetchedModels.includes(currentValue) ? [currentValue, ...fetchedModels] : fetchedModels;
}

function getLocalModelDiscoveryNote(status: "idle" | "loading" | "ready" | "error" | "blocked", message: string) {
  if (status === "loading") {
    return "Loading models from /v1/models…";
  }

  if (status === "blocked") {
    return message;
  }

  if (status === "error") {
    return "Could not load models from the current endpoint. You can still type the model id manually.";
  }

  return "Models are discovered automatically from /v1/models.";
}

export function AppearancePanel({
  apiKey = "",
  geminiModel = "gemini-2.5-flash",
  grammarLlmApiUrl = "",
  grammarLlmModel = "",
  llmApiUrl = "",
  localLlmModel = "",
  onApiKeyChange,
  onChange,
  onGeminiModelChange,
  onGrammarLlmApiUrlChange,
  onGrammarLlmModelChange,
  onLlmApiUrlChange,
  onLocalLlmModelChange,
  onTranslationProviderChange,
  preferences,
  translationProvider = "local_llm",
}: AppearancePanelProps) {
  const localModelState = useLocalLlmModels(llmApiUrl, translationProvider === "local_llm");
  const localModelOptions = mergeModelOptions(localLlmModel, localModelState.models);
  const useManualLocalModelInput = localModelState.status === "blocked" || localModelState.status === "error";
  const grammarModelDiscoveryEndpoint = grammarLlmApiUrl || llmApiUrl;
  const grammarModelState = useLocalLlmModels(grammarModelDiscoveryEndpoint, translationProvider === "local_llm");
  const grammarModelOptions = mergeModelOptions(grammarLlmModel, grammarModelState.models);
  const useManualGrammarModelInput = grammarModelState.status === "blocked" || grammarModelState.status === "error";

  return (
    <section className="reader-panel" aria-label="Appearance">
      <h2>Appearance</h2>
      <div className="appearance-grid">
        <label className="appearance-field">
          <span>Font family</span>
          <select
            aria-label="Font family"
            onChange={(event) => onChange?.({ fontFamily: event.target.value as ReaderPreferences["fontFamily"] })}
            value={preferences.fontFamily}
          >
            <option value="book">Book serif</option>
            <option value="serif">Classic serif</option>
            <option value="sans">Sans</option>
          </select>
        </label>
        <label className="appearance-field">
          <span>Column count</span>
          <select
            aria-label="Column count"
            onChange={(event) => onChange?.({ columnCount: Number(event.target.value) as 1 | 2 })}
            value={preferences.columnCount}
          >
            <option value="1">Single column</option>
            <option value="2">Two columns</option>
          </select>
        </label>
        <label className="appearance-field">
          <span>Font size</span>
          <input
            aria-label="Font size"
            max="2"
            min="0.8"
            onChange={(event) => parseNumericPatch(event.target.value, onChange, "fontScale")}
            step="0.05"
            type="number"
            value={preferences.fontScale}
          />
        </label>
        <label className="appearance-field">
          <span>Line height</span>
          <input
            aria-label="Line height"
            min="1.2"
            onChange={(event) => parseNumericPatch(event.target.value, onChange, "lineHeight")}
            step="0.05"
            type="number"
            value={preferences.lineHeight}
          />
        </label>
        <label className="appearance-field">
          <span>Now reading text size</span>
          <input
            aria-label="Now reading text size"
            max="1.6"
            min="0.85"
            onChange={(event) => parseNumericPatch(event.target.value, onChange, "ttsSentenceTranslationFontScale")}
            step="0.05"
            type="number"
            value={preferences.ttsSentenceTranslationFontScale}
          />
        </label>
        <label className="appearance-field">
          <span>Letter spacing</span>
          <input
            aria-label="Letter spacing"
            min="0"
            onChange={(event) => parseNumericPatch(event.target.value, onChange, "letterSpacing")}
            step="0.01"
            type="number"
            value={preferences.letterSpacing}
          />
        </label>
        <label className="appearance-field">
          <span>Paragraph spacing</span>
          <input
            aria-label="Paragraph spacing"
            min="0"
            onChange={(event) => parseNumericPatch(event.target.value, onChange, "paragraphSpacing")}
            step="0.05"
            type="number"
            value={preferences.paragraphSpacing}
          />
        </label>
        <label className="appearance-field">
          <span>Paragraph indent</span>
          <input
            aria-label="Paragraph indent"
            min="0"
            onChange={(event) => parseNumericPatch(event.target.value, onChange, "paragraphIndent")}
            step="0.1"
            type="number"
            value={preferences.paragraphIndent}
          />
        </label>
        <label className="appearance-field">
          <span>Page padding</span>
          <input
            aria-label="Page padding"
            min="8"
            onChange={(event) => parseNumericPatch(event.target.value, onChange, "contentPadding")}
            step="2"
            type="number"
            value={preferences.contentPadding}
          />
        </label>
        <label className="appearance-field appearance-field-color">
          <span>Page background</span>
          <input
            aria-label="Page background"
            onChange={(event) => onChange?.({ contentBackgroundColor: event.target.value })}
            type="color"
            value={preferences.contentBackgroundColor}
          />
        </label>
        <label className="appearance-field">
          <span>Translation provider</span>
          <select
            aria-label="Translation provider"
            onChange={(event) => onTranslationProviderChange?.(event.target.value as TranslationProvider)}
            value={translationProvider}
          >
            {translationProviderOptions.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>
        {translationProvider === "local_llm" ? (
          <>
            <label className="appearance-field appearance-field-wide">
              <span>LLM API URL</span>
              <input
                aria-label="LLM API URL"
                inputMode="url"
                onChange={(event) => onLlmApiUrlChange?.(event.target.value)}
                placeholder="http://localhost:1234/v1"
                type="url"
                value={llmApiUrl}
              />
              <small className="appearance-field-note">Accepts `/v1`, `/chat/completions`, or `/completions`.</small>
            </label>
            <label className="appearance-field appearance-field-wide">
              <span>Grammar LLM API URL</span>
              <input
                aria-label="Grammar LLM API URL"
                inputMode="url"
                onChange={(event) => onGrammarLlmApiUrlChange?.(event.target.value)}
                placeholder="http://localhost:1234/v1"
                type="url"
                value={grammarLlmApiUrl}
              />
              <small className="appearance-field-note">Used only for Explain grammar analysis.</small>
            </label>
            <label className="appearance-field appearance-field-wide">
              <span>Local LLM model</span>
              {useManualLocalModelInput ? (
                <input
                  aria-label="Local LLM model"
                  autoComplete="off"
                  onChange={(event) => onLocalLlmModelChange?.(event.target.value)}
                  placeholder="tencent/HY-MT1.5-1.8B-GGUF:Q8_0"
                  spellCheck={false}
                  type="text"
                  value={localLlmModel}
                />
              ) : (
                <select
                  aria-label="Local LLM model"
                  onChange={(event) => onLocalLlmModelChange?.(event.target.value)}
                  value={localLlmModel}
                >
                  <option value="">Default model</option>
                  {localModelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              )}
              <small className="appearance-field-note">
                {getLocalModelDiscoveryNote(localModelState.status, localModelState.message)}
              </small>
            </label>
            <label className="appearance-field appearance-field-wide">
              <span>Grammar LLM model</span>
              {useManualGrammarModelInput ? (
                <input
                  aria-label="Grammar LLM model"
                  autoComplete="off"
                  onChange={(event) => onGrammarLlmModelChange?.(event.target.value)}
                  placeholder="grammar-model"
                  spellCheck={false}
                  type="text"
                  value={grammarLlmModel}
                />
              ) : (
                <select
                  aria-label="Grammar LLM model"
                  onChange={(event) => onGrammarLlmModelChange?.(event.target.value)}
                  value={grammarLlmModel}
                >
                  <option value="">Reuse translation model</option>
                  {grammarModelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              )}
              <small className="appearance-field-note">
                {getLocalModelDiscoveryNote(grammarModelState.status, grammarModelState.message)} Leave blank to reuse the
                normal translation model.
              </small>
            </label>
          </>
        ) : (
          <>
            <label className="appearance-field appearance-field-wide">
              <span>Gemini API Key</span>
              <input
                aria-label="Gemini API Key"
                autoComplete="off"
                onChange={(event) => onApiKeyChange?.(event.target.value)}
                placeholder="AIza..."
                spellCheck={false}
                type="password"
                value={apiKey}
              />
              <small className="appearance-field-note">Stored only in this browser for direct Gemini access.</small>
            </label>
            <label className="appearance-field appearance-field-wide">
              <span>Gemini model</span>
              <select aria-label="Gemini model" onChange={(event) => onGeminiModelChange?.(event.target.value)} value={geminiModel}>
                {geminiModelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="appearance-field">
          <span>Max line width</span>
          <input
            aria-label="Max line width"
            min="480"
            onChange={(event) => parseNumericPatch(event.target.value, onChange, "maxLineWidth")}
            step="10"
            type="number"
            value={preferences.maxLineWidth}
          />
        </label>
      </div>
    </section>
  );
}
