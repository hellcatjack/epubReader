import { useMemo, useState } from "react";
import { createOpenAIAdapter, normalizeOpenAIError } from "./openaiAdapter";

export function OpenAISpikePage() {
  const [selectionText, setSelectionText] = useState("Hola mundo");
  const [targetLanguage, setTargetLanguage] = useState("zh-CN");
  const [result, setResult] = useState("No request sent yet.");
  const [audioStatus] = useState("TTS is temporarily disabled for the local model flow.");

  const adapter = useMemo(() => createOpenAIAdapter(), []);

  async function handleTranslate() {
    try {
      setResult("Requesting translation...");
      const next = await adapter.translateSelection(selectionText, { targetLanguage });
      setResult(next || "Translation returned no text.");
    } catch (error) {
      setResult(`Translate failed: ${normalizeOpenAIError(error).kind}`);
    }
  }

  async function handleExplain() {
    try {
      setResult("Requesting explanation...");
      const next = await adapter.explainSelection(selectionText, { targetLanguage });
      setResult(next || "Explanation returned no text.");
    } catch (error) {
      setResult(`Explain failed: ${normalizeOpenAIError(error).kind}`);
    }
  }

  return (
    <main>
      <section aria-label="OpenAI browser spike">
        <h1>Local Translation Spike</h1>
        <p>Translation and explanation now default to the local OpenAI-compatible endpoint at `192.168.1.31:8001` without authentication.</p>
        <label>
          Selection text
          <textarea value={selectionText} onChange={(event) => setSelectionText(event.target.value)} />
        </label>
        <label>
          Target language
          <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
            <option value="en">English</option>
            <option value="zh-CN">Chinese</option>
          </select>
        </label>
        <div>
          <button type="button" onClick={handleTranslate}>
            Translate
          </button>
          <button type="button" onClick={handleExplain}>
            Explain
          </button>
        </div>
        <p>{result}</p>
        <p>{audioStatus}</p>
      </section>
    </main>
  );
}
