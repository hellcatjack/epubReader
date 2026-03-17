type TtsStatusPanelProps = {
  currentText?: string;
  error?: string;
  onPause?: () => void;
  onResume?: () => void;
  onStart?: () => void;
  onStop?: () => void;
  startDisabled?: boolean;
  status?: "idle" | "warming_up" | "loading" | "playing" | "paused" | "error";
};

export function TtsStatusPanel({
  currentText,
  error,
  onPause,
  onResume,
  onStart,
  onStop,
  startDisabled = false,
  status = "idle",
}: TtsStatusPanelProps) {
  const statusLabel =
    status === "warming_up"
      ? "Warming up model"
      : status === "loading"
        ? "Generating next segment"
        : status;

  return (
    <section className="reader-panel" aria-label="TTS queue">
      <h2>TTS queue</h2>
      <p>TTS status: {statusLabel}</p>
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
    </section>
  );
}
