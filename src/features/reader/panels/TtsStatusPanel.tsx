import { useId, useState } from "react";
import type { BrowserTtsVoice } from "../../tts/browserTtsClient";

type TtsStatusPanelProps = {
  currentText?: string;
  error?: string;
  followPlayback?: boolean;
  onFollowPlaybackChange?: (enabled: boolean) => void;
  onPause?: () => void;
  onRateChange?: (rate: number) => void;
  onResume?: () => void;
  onStartPointerDown?: () => void;
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

function formatStatusLabel(status: TtsStatusPanelProps["status"]) {
  switch (status) {
    case "loading":
      return "Loading";
    case "playing":
      return "Playing";
    case "paused":
      return "Paused";
    case "error":
      return "Attention";
    case "idle":
    default:
      return "Ready";
  }
}

export function TtsStatusPanel({
  currentText,
  error,
  followPlayback = false,
  onFollowPlaybackChange,
  onPause,
  onRateChange,
  onResume,
  onStartPointerDown,
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
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const advancedPanelId = useId();
  const currentLabel = currentText || "Ready to read the current selection or chapter.";
  const activeVoiceLabel =
    voices.find((voice) => voice.id === voiceId)?.displayName ||
    voiceId ||
    "System voice";
  const compactVoiceLabel = activeVoiceLabel.replace(/\s+Online\s+\(Natural\)$/i, "");
  const compactRateLabel = `${rate.toFixed(1)}x`;
  const compactVolumeLabel = `${Math.round(volume * 100)}%`;
  const advancedSummary = `${compactVoiceLabel} · ${compactRateLabel} · ${compactVolumeLabel}`;

  return (
    <section className="reader-panel reader-tts-panel" aria-label="TTS queue">
      <div className="reader-tts-header">
        <h2>TTS queue</h2>
        <span className="reader-tts-badge" data-status={status}>
          {formatStatusLabel(status)}
        </span>
      </div>
      <div className="reader-tts-current reader-tts-current-compact">
        <span className="reader-tts-current-label">{currentText ? "Current" : "Ready"}</span>
        <p title={currentLabel}>{currentLabel}</p>
      </div>
      {error ? <p className="reader-tts-error">{error}</p> : null}
      <div className="reader-tts-actions" role="group" aria-label="TTS controls">
        <button
          type="button"
          onClick={onStart}
          onMouseDown={(event) => {
            onStartPointerDown?.();
            event.preventDefault();
          }}
          disabled={startDisabled}
        >
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
      <div className="reader-tts-advanced">
        <button
          type="button"
          className="reader-tts-advanced-toggle"
          aria-controls={advancedPanelId}
          aria-expanded={showAdvancedControls}
          onClick={() => setShowAdvancedControls((current) => !current)}
        >
          <span className="reader-tts-advanced-title">Voice, speed, volume</span>
          <span className="reader-tts-advanced-summary" title={advancedSummary}>
            {advancedSummary}
          </span>
        </button>
        {showAdvancedControls ? (
          <div className="reader-tts-advanced-panel" id={advancedPanelId}>
            <div className="reader-tts-settings" role="group" aria-label="TTS settings">
              <label className="reader-tts-field reader-tts-toggle">
                <span>Follow TTS playback</span>
                <input
                  aria-label="Follow TTS playback"
                  checked={followPlayback}
                  onChange={(event) => onFollowPlaybackChange?.(event.target.checked)}
                  type="checkbox"
                />
              </label>
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
            <div className="reader-tts-presets" role="group" aria-label="TTS rate presets">
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
          </div>
        ) : null}
      </div>
    </section>
  );
}
