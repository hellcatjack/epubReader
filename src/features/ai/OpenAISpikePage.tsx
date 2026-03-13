import { useMemo, useState } from "react";
import { createOpenAIAdapter, normalizeOpenAIError } from "./openaiAdapter";
import { createAudioPlayer } from "../tts/audioPlayer";

const player = createAudioPlayer();

export function OpenAISpikePage() {
  const [apiKey, setApiKey] = useState("");
  const [selectionText, setSelectionText] = useState("Hola mundo");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [voice, setVoice] = useState("alloy");
  const [result, setResult] = useState("No request sent yet.");
  const [audioStatus, setAudioStatus] = useState("No audio generated yet.");

  const adapter = useMemo(() => createOpenAIAdapter({ apiKey }), [apiKey]);

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

  async function handleSpeech() {
    try {
      setAudioStatus("Requesting speech...");
      const blob = await adapter.synthesizeSpeech(selectionText, { voice });
      await player.load(blob);
      await player.play();
      setAudioStatus("Speech generated and queued through the shared player.");
    } catch (error) {
      setAudioStatus(`Speech failed: ${normalizeOpenAIError(error).kind}`);
    }
  }

  return (
    <main>
      <section aria-label="OpenAI browser spike">
        <h1>OpenAI Browser Spike</h1>
        <p>OpenAI recommends keeping API keys server-side. This page exists only to validate the pure frontend MVP path.</p>
        <label>
          API key
          <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
        </label>
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
        <label>
          Voice
          <select value={voice} onChange={(event) => setVoice(event.target.value)}>
            <option value="alloy">Alloy</option>
            <option value="verse">Verse</option>
          </select>
        </label>
        <div>
          <button type="button" onClick={handleTranslate}>
            Translate
          </button>
          <button type="button" onClick={handleExplain}>
            Explain
          </button>
          <button type="button" onClick={handleSpeech}>
            Generate speech
          </button>
        </div>
        <p>{result}</p>
        <p>{audioStatus}</p>
      </section>
    </main>
  );
}
