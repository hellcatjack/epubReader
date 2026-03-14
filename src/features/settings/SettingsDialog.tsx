import { useEffect, useState } from "react";
import type { ReaderFontFamily, ReadingMode, SettingsInput, ThemeName } from "../../lib/types/settings";
import { defaultSettings, getResolvedSettings, saveSettings } from "./settingsRepository";

const themeOptions: ThemeName[] = ["light", "sepia", "dark"];
const readingModeOptions: ReadingMode[] = ["scrolled", "paginated"];
const fontFamilyOptions: ReaderFontFamily[] = ["book", "serif", "sans"];
const languageOptions = [
  { label: "English", value: "en" },
  { label: "Chinese", value: "zh-CN" },
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
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState("Local translation is enabled. TTS is currently disabled.");

  useEffect(() => {
    void getResolvedSettings().then((nextSettings) => {
      setSettings({ ...defaultSettings, ...nextSettings });
      setFontScaleInput(String(nextSettings.fontScale));
      setLineHeightInput(String(nextSettings.lineHeight));
      setLetterSpacingInput(String(nextSettings.letterSpacing));
      setParagraphSpacingInput(String(nextSettings.paragraphSpacing));
      setParagraphIndentInput(String(nextSettings.paragraphIndent));
      setContentPaddingInput(String(nextSettings.contentPadding));
      setMaxLineWidthInput(String(nextSettings.maxLineWidth));
      setIsReady(true);
    });
  }, []);

  async function handleSave() {
    const nextFontScale = parseNumberInput(fontScaleInput, defaultSettings.fontScale);
    const nextLineHeight = parseNumberInput(lineHeightInput, defaultSettings.lineHeight);
    const nextLetterSpacing = parseNumberInput(letterSpacingInput, defaultSettings.letterSpacing);
    const nextParagraphSpacing = parseNumberInput(paragraphSpacingInput, defaultSettings.paragraphSpacing);
    const nextParagraphIndent = parseNumberInput(paragraphIndentInput, defaultSettings.paragraphIndent);
    const nextContentPadding = parseNumberInput(contentPaddingInput, defaultSettings.contentPadding);
    const nextMaxLineWidth = parseNumberInput(maxLineWidthInput, defaultSettings.maxLineWidth);
    const nextSettings = {
      ...settings,
      fontScale: nextFontScale,
      lineHeight: nextLineHeight,
      letterSpacing: nextLetterSpacing,
      paragraphSpacing: nextParagraphSpacing,
      paragraphIndent: nextParagraphIndent,
      contentPadding: nextContentPadding,
      maxLineWidth: nextMaxLineWidth,
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
    setStatus("Settings saved.");
  }

  return (
    <section aria-label="Reader settings" className="bookshelf-settings">
      <h2>Settings</h2>
      {isReady ? (
        <>
          <label>
            Target language
            <select
              aria-label="Target language"
              onChange={(event) => setSettings((current) => ({ ...current, targetLanguage: event.target.value }))}
              value={settings.targetLanguage}
            >
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Theme
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
          <label>
            Reading mode
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
          <label>
            Font family
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
          <label>
            Font scale
            <input
              aria-label="Font scale"
              inputMode="decimal"
              onChange={(event) => setFontScaleInput(event.target.value)}
              step="0.1"
              type="number"
              value={fontScaleInput}
            />
          </label>
          <label>
            Line height
            <input
              aria-label="Line height"
              inputMode="decimal"
              onChange={(event) => setLineHeightInput(event.target.value)}
              step="0.1"
              type="number"
              value={lineHeightInput}
            />
          </label>
          <label>
            Letter spacing
            <input
              aria-label="Letter spacing"
              inputMode="decimal"
              onChange={(event) => setLetterSpacingInput(event.target.value)}
              step="0.01"
              type="number"
              value={letterSpacingInput}
            />
          </label>
          <label>
            Paragraph spacing
            <input
              aria-label="Paragraph spacing"
              inputMode="decimal"
              onChange={(event) => setParagraphSpacingInput(event.target.value)}
              step="0.1"
              type="number"
              value={paragraphSpacingInput}
            />
          </label>
          <label>
            Paragraph indent
            <input
              aria-label="Paragraph indent"
              inputMode="decimal"
              onChange={(event) => setParagraphIndentInput(event.target.value)}
              step="0.1"
              type="number"
              value={paragraphIndentInput}
            />
          </label>
          <label>
            Page padding
            <input
              aria-label="Page padding"
              inputMode="decimal"
              onChange={(event) => setContentPaddingInput(event.target.value)}
              step="1"
              type="number"
              value={contentPaddingInput}
            />
          </label>
          <label>
            Max line width
            <input
              aria-label="Max line width"
              inputMode="decimal"
              onChange={(event) => setMaxLineWidthInput(event.target.value)}
              step="10"
              type="number"
              value={maxLineWidthInput}
            />
          </label>
          <label>
            Column count
            <select
              aria-label="Column count"
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  columnCount: Number.parseInt(event.target.value, 10) === 2 ? 2 : 1,
                }))
              }
              value={String(settings.columnCount)}
            >
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </label>
        </>
      ) : (
        <p>Loading settings…</p>
      )}
      <p className="settings-disclosure">
        Translation and explanation requests are sent directly from this browser to the local model endpoint.
      </p>
      <button onClick={handleSave} type="button">
        Save settings
      </button>
      <p>{status}</p>
    </section>
  );
}
