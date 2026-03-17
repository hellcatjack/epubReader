type TtsStatusPanelProps = {
  currentText?: string;
  error?: string;
  onPause?: () => void;
  onRateChange?: (rate: number) => void;
  onResume?: () => void;
  onStart?: () => void;
  onStop?: () => void;
  rate?: number;
  startDisabled?: boolean;
  status?: "idle" | "loading" | "playing" | "paused" | "error";
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
  rate = 1,
  startDisabled = false,
  status = "idle",
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
