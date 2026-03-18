import type { BrowserTtsVoice } from "../../tts/browserTtsClient";

type TtsStatusPanelProps = {
  currentText?: string;
  error?: string;
  onPause?: () => void;
  onRateChange?: (rate: number) => void;
  onResume?: () => void;
  onStart?: () => void;
  onStop?: () => void;
  onVoiceChange?: (voiceId: string) => void;
  onVolumeChange?: (volume: number) => void;
  rate?: number;
  startDisabled?: boolean;
  status?: "idle" | "loading" | "playing" | "paused" | "error";
  voiceId?: string;
  voices?: BrowserTtsVoice[];
  volume?: number;
};

const quickRates = [0.8, 1, 1.2, 1.4];

export function TtsStatusPanel({
  currentText,
  error,
  onPause,
  onRateChange,
  onResume,
  onStart,
  onStop,
  onVoiceChange,
  onVolumeChange,
  rate = 1,
  startDisabled = false,
  status = "idle",
  voiceId = "",
  voices = [],
  volume = 1,
}: TtsStatusPanelProps) {
  return (
    <section className="reader-panel" aria-label="TTS queue">
      <h2>TTS queue</h2>
      <p>TTS status: {status}</p>
      {currentText ? <p>Current: {currentText}</p> : <p>Ready to read the current selection or chapter.</p>}
      {error ? <p>{error}</p> : null}
      <div className="reader-tts-actions" role="group" aria-label="TTS controls">
        <button type="button" onClick={onStart} disabled={startDisabled}>
          Start TTS
        </button>
        <button type="button" onClick={onPause}>
          Pause TTS
        </button>
        <button type="button" onClick={onResume}>
          Resume TTS
        </button>
        <button type="button" onClick={onStop}>
          Stop TTS
        </button>
      </div>
      <div className="reader-tts-settings" role="group" aria-label="TTS settings">
        <label className="reader-tts-field reader-tts-voice">
          <span>Voice</span>
          <select
            aria-label="TTS voice"
            onChange={(event) => onVoiceChange?.(event.target.value)}
            value={voiceId}
          >
            {voices.length ? null : <option value={voiceId}>{voiceId}</option>}
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="reader-tts-field reader-tts-number">
          <span>Rate</span>
          <input
            aria-label="TTS rate"
            inputMode="decimal"
            onChange={(event) => onRateChange?.(Number.parseFloat(event.target.value || "1") || 1)}
            step="0.05"
            type="number"
            value={rate}
          />
        </label>
        <label className="reader-tts-field reader-tts-number">
          <span>Volume</span>
          <input
            aria-label="TTS volume"
            inputMode="decimal"
            max="1"
            min="0"
            onChange={(event) => onVolumeChange?.(Number.parseFloat(event.target.value || "1") || 1)}
            step="0.05"
            type="number"
            value={volume}
          />
        </label>
      </div>
      <div className="reader-tts-actions" role="group" aria-label="TTS rate presets">
        {quickRates.map((presetRate) => {
          const label = `${presetRate.toFixed(1)}x`;
          return (
            <button
              key={presetRate}
              type="button"
              aria-pressed={Math.abs(rate - presetRate) < 0.001}
              onClick={() => onRateChange?.(presetRate)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
