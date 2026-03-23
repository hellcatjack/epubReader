import { useEffect, useState } from "react";
import type { ReaderFontFamily, ReadingMode, SettingsInput, ThemeName } from "../../lib/types/settings";
import { createBrowserTtsClient, type BrowserTtsVoice } from "../tts/browserTtsClient";
import { defaultSettings, getResolvedSettings, saveSettings } from "./settingsRepository";
import "./settings.css";

const themeOptions: ThemeName[] = ["light", "sepia", "dark"];
const readingModeOptions: ReadingMode[] = ["scrolled", "paginated"];
const fontFamilyOptions: ReaderFontFamily[] = ["book", "serif", "sans"];
const languageOptions = [
  { label: "Chinese", value: "zh-CN" },
  { label: "English", value: "en" },
  { label: "French", value: "fr" },
];

function parseNumberInput(value: string, fallback: number) {
  return Number.parseFloat(value || String(fallback)) || fallback;
}

export function SettingsDialog() {
  const [settings, setSettings] = useState<SettingsInput>(defaultSettings);
  const [fontScaleInput, setFontScaleInput] = useState(String(defaultSettings.fontScale));
  const [lineHeightInput, setLineHeightInput] = useState(String(defaultSettings.lineHeight));
  const [letterSpacingInput, setLetterSpacingInput] = useState(String(defaultSettings.letterSpacing));
  const [paragraphSpacingInput, setParagraphSpacingInput] = useState(String(defaultSettings.paragraphSpacing));
  const [paragraphIndentInput, setParagraphIndentInput] = useState(String(defaultSettings.paragraphIndent));
  const [contentPaddingInput, setContentPaddingInput] = useState(String(defaultSettings.contentPadding));
  const [maxLineWidthInput, setMaxLineWidthInput] = useState(String(defaultSettings.maxLineWidth));
  const [ttsRateInput, setTtsRateInput] = useState(String(defaultSettings.ttsRate));
  const [ttsVolumeInput, setTtsVolumeInput] = useState(String(defaultSettings.ttsVolume));
  const [ttsVoices, setTtsVoices] = useState<BrowserTtsVoice[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [showAdvancedTypography, setShowAdvancedTypography] = useState(false);
  const [status, setStatus] = useState("Local translation is enabled. TTS is optimized for Microsoft Edge on desktop.");

  useEffect(() => {
    let cancelled = false;

    void getResolvedSettings().then(async (nextSettings) => {
      if (cancelled) {
        return;
      }

      const resolvedSettings = { ...defaultSettings, ...nextSettings };
      let nextVoices: BrowserTtsVoice[] = [];
      try {
        nextVoices = await createBrowserTtsClient().getVoices();
      } catch {
        nextVoices = [];
      }

      if (cancelled) {
        return;
      }

      const resolvedVoice =
        nextVoices.find((voice) => voice.id === resolvedSettings.ttsVoice)?.id ??
        nextVoices.find((voice) => voice.isDefault)?.id ??
        nextVoices[0]?.id ??
        resolvedSettings.ttsVoice;

      setTtsVoices(nextVoices);
      setSettings({ ...resolvedSettings, ttsVoice: resolvedVoice });
      setFontScaleInput(String(nextSettings.fontScale));
      setLineHeightInput(String(nextSettings.lineHeight));
      setLetterSpacingInput(String(nextSettings.letterSpacing));
      setParagraphSpacingInput(String(nextSettings.paragraphSpacing));
      setParagraphIndentInput(String(nextSettings.paragraphIndent));
      setContentPaddingInput(String(nextSettings.contentPadding));
      setMaxLineWidthInput(String(nextSettings.maxLineWidth));
      setTtsRateInput(String(nextSettings.ttsRate));
      setTtsVolumeInput(String(nextSettings.ttsVolume));
      setIsReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    const nextFontScale = parseNumberInput(fontScaleInput, defaultSettings.fontScale);
    const nextLineHeight = parseNumberInput(lineHeightInput, defaultSettings.lineHeight);
    const nextLetterSpacing = parseNumberInput(letterSpacingInput, defaultSettings.letterSpacing);
    const nextParagraphSpacing = parseNumberInput(paragraphSpacingInput, defaultSettings.paragraphSpacing);
    const nextParagraphIndent = parseNumberInput(paragraphIndentInput, defaultSettings.paragraphIndent);
    const nextContentPadding = parseNumberInput(contentPaddingInput, defaultSettings.contentPadding);
    const nextMaxLineWidth = parseNumberInput(maxLineWidthInput, defaultSettings.maxLineWidth);
    const nextTtsRate = parseNumberInput(ttsRateInput, defaultSettings.ttsRate);
    const nextTtsVolume = parseNumberInput(ttsVolumeInput, defaultSettings.ttsVolume);
    const nextSettings = {
      ...settings,
      fontScale: nextFontScale,
      lineHeight: nextLineHeight,
      letterSpacing: nextLetterSpacing,
      paragraphSpacing: nextParagraphSpacing,
      paragraphIndent: nextParagraphIndent,
      contentPadding: nextContentPadding,
      maxLineWidth: nextMaxLineWidth,
      ttsRate: nextTtsRate,
      ttsVolume: nextTtsVolume,
    };

    await saveSettings(nextSettings);
    setSettings(nextSettings);
    setFontScaleInput(String(nextFontScale));
    setLineHeightInput(String(nextLineHeight));
    setLetterSpacingInput(String(nextLetterSpacing));
    setParagraphSpacingInput(String(nextParagraphSpacing));
    setParagraphIndentInput(String(nextParagraphIndent));
    setContentPaddingInput(String(nextContentPadding));
    setMaxLineWidthInput(String(nextMaxLineWidth));
    setTtsRateInput(String(nextTtsRate));
    setTtsVolumeInput(String(nextTtsVolume));
    setStatus("Settings saved.");
  }

  return (
    <section aria-label="Reader settings" className="settings-dialog">
      <div className="settings-dialog-header">
        <div>
          <p className="settings-dialog-eyebrow">Reader preferences</p>
          <h2>Settings</h2>
        </div>
        <p className="settings-dialog-copy">Adjust language, reading, and playback defaults without leaving the library.</p>
      </div>
      {isReady ? (
        <>
          <section className="settings-section" aria-label="Common settings">
            <header className="settings-section-header">
              <div>
                <p className="settings-section-eyebrow">Common</p>
                <h3>Most-used controls</h3>
              </div>
            </header>
            <div className="settings-grid">
              <label className="settings-field">
                <span>Target language</span>
                <select
                  aria-label="Target language"
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      targetLanguage: event.target.value,
                      targetLanguageCustomized: true,
                    }))
                  }
                  value={settings.targetLanguage}
                >
                  {languageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings-field">
                <span>Theme</span>
                <select
                  aria-label="Theme"
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, theme: event.target.value as ThemeName }))
                  }
                  value={settings.theme}
                >
                  {themeOptions.map((theme) => (
                    <option key={theme} value={theme}>
                      {theme}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings-field">
                <span>Reading mode</span>
                <select
                  aria-label="Reading mode"
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, readingMode: event.target.value as ReadingMode }))
                  }
                  value={settings.readingMode}
                >
                  {readingModeOptions.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings-field settings-field-wide">
                <span>TTS voice</span>
                <select
                  aria-label="TTS voice"
                  onChange={(event) => setSettings((current) => ({ ...current, ttsVoice: event.target.value }))}
                  value={settings.ttsVoice}
                >
                  {ttsVoices.length ? null : <option value={settings.ttsVoice}>{settings.ttsVoice}</option>}
                  {ttsVoices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings-field settings-field-wide">
                <span>LLM API URL</span>
                <input
                  aria-label="LLM API URL"
                  inputMode="url"
                  onChange={(event) => setSettings((current) => ({ ...current, llmApiUrl: event.target.value }))}
                  placeholder="http://localhost:1234/v1"
                  type="url"
                  value={settings.llmApiUrl}
                />
                <small>Accepts `/v1`, `/chat/completions`, or `/completions`.</small>
              </label>
              <label className="settings-field">
                <span>TTS rate</span>
                <input
                  aria-label="TTS rate"
                  inputMode="decimal"
                  onChange={(event) => setTtsRateInput(event.target.value)}
                  step="0.05"
                  type="number"
                  value={ttsRateInput}
                />
              </label>
              <label className="settings-field">
                <span>TTS volume</span>
                <input
                  aria-label="TTS volume"
                  inputMode="decimal"
                  max="1"
                  min="0"
                  onChange={(event) => setTtsVolumeInput(event.target.value)}
                  step="0.05"
                  type="number"
                  value={ttsVolumeInput}
                />
              </label>
            </div>
          </section>

          <section className="settings-section" aria-label="Advanced typography settings">
            <header className="settings-section-header">
              <div>
                <p className="settings-section-eyebrow">Advanced</p>
                <h3>Typography and layout</h3>
              </div>
              <button
                type="button"
                className="settings-toggle"
                aria-expanded={showAdvancedTypography}
                onClick={() => setShowAdvancedTypography((current) => !current)}
              >
                {showAdvancedTypography ? "Hide advanced typography" : "Advanced typography"}
              </button>
            </header>
            {showAdvancedTypography ? (
              <div className="settings-grid">
                <label className="settings-field">
                  <span>Font family</span>
                  <select
                    aria-label="Font family"
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, fontFamily: event.target.value as ReaderFontFamily }))
                    }
                    value={settings.fontFamily}
                  >
                    {fontFamilyOptions.map((fontFamily) => (
                      <option key={fontFamily} value={fontFamily}>
                        {fontFamily}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  <span>Font scale</span>
                  <input
                    aria-label="Font scale"
                    inputMode="decimal"
                    onChange={(event) => setFontScaleInput(event.target.value)}
                    step="0.1"
                    type="number"
                    value={fontScaleInput}
                  />
                </label>
                <label className="settings-field">
                  <span>Line height</span>
                  <input
                    aria-label="Line height"
                    inputMode="decimal"
                    onChange={(event) => setLineHeightInput(event.target.value)}
                    step="0.1"
                    type="number"
                    value={lineHeightInput}
                  />
                </label>
                <label className="settings-field">
                  <span>Letter spacing</span>
                  <input
                    aria-label="Letter spacing"
                    inputMode="decimal"
                    onChange={(event) => setLetterSpacingInput(event.target.value)}
                    step="0.01"
                    type="number"
                    value={letterSpacingInput}
                  />
                </label>
                <label className="settings-field">
                  <span>Paragraph spacing</span>
                  <input
                    aria-label="Paragraph spacing"
                    inputMode="decimal"
                    onChange={(event) => setParagraphSpacingInput(event.target.value)}
                    step="0.1"
                    type="number"
                    value={paragraphSpacingInput}
                  />
                </label>
                <label className="settings-field">
                  <span>Paragraph indent</span>
                  <input
                    aria-label="Paragraph indent"
                    inputMode="decimal"
                    onChange={(event) => setParagraphIndentInput(event.target.value)}
                    step="0.1"
                    type="number"
                    value={paragraphIndentInput}
                  />
                </label>
                <label className="settings-field">
                  <span>Page padding</span>
                  <input
                    aria-label="Page padding"
                    inputMode="decimal"
                    onChange={(event) => setContentPaddingInput(event.target.value)}
                    step="1"
                    type="number"
                    value={contentPaddingInput}
                  />
                </label>
                <label className="settings-field settings-field-color">
                  <span>Page background</span>
                  <input
                    aria-label="Page background"
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, contentBackgroundColor: event.target.value }))
                    }
                    type="color"
                    value={settings.contentBackgroundColor}
                  />
                </label>
                <label className="settings-field">
                  <span>Max line width</span>
                  <input
                    aria-label="Max line width"
                    inputMode="decimal"
                    onChange={(event) => setMaxLineWidthInput(event.target.value)}
                    step="10"
                    type="number"
                    value={maxLineWidthInput}
                  />
                </label>
                <label className="settings-field">
                  <span>Column count</span>
                  <select
                    aria-label="Column count"
                    disabled={settings.readingMode === "paginated"}
                    onChange={(event) => {
                      setSettings((current) => ({
                        ...current,
                        columnCount: Number.parseInt(event.target.value, 10) === 2 ? 2 : 1,
                      }));
                    }}
                    value={String(settings.readingMode === "paginated" ? 1 : settings.columnCount)}
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                  </select>
                </label>
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <p className="settings-loading">Loading settings…</p>
      )}
      <div className="settings-footer">
        <p className="settings-disclosure">
          Translation and explanation requests are sent directly from this browser to your configured model endpoint.
        </p>
        <div className="settings-actions">
          <button onClick={handleSave} type="button" className="settings-save-button">
            Save settings
          </button>
          <p className="settings-status">{status}</p>
        </div>
      </div>
    </section>
  );
}
