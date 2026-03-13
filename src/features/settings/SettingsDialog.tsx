import { useEffect, useState } from "react";
import type { SettingsInput, ThemeName } from "../../lib/types/settings";
import { defaultSettings, getResolvedSettings, saveSettings } from "./settingsRepository";

const themeOptions: ThemeName[] = ["light", "sepia", "dark"];
const languageOptions = [
  { label: "English", value: "en" },
  { label: "Chinese", value: "zh-CN" },
  { label: "French", value: "fr" },
];

export function SettingsDialog() {
  const [settings, setSettings] = useState<SettingsInput>(defaultSettings);
  const [fontScaleInput, setFontScaleInput] = useState(String(defaultSettings.fontScale));
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState("Local translation is enabled. TTS is currently disabled.");

  useEffect(() => {
    void getResolvedSettings().then((nextSettings) => {
      setSettings({
        apiKey: nextSettings.apiKey,
        targetLanguage: nextSettings.targetLanguage,
        theme: nextSettings.theme,
        ttsVoice: nextSettings.ttsVoice,
        fontScale: nextSettings.fontScale,
      });
      setFontScaleInput(String(nextSettings.fontScale));
      setIsReady(true);
    });
  }, []);

  async function handleSave() {
    const nextFontScale = Number.parseFloat(fontScaleInput || "1") || 1;
    const nextSettings = {
      ...settings,
      fontScale: nextFontScale,
    };

    await saveSettings(nextSettings);
    setSettings(nextSettings);
    setFontScaleInput(String(nextFontScale));
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
