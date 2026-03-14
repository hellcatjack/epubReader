import type { ReaderPreferences } from "../readerPreferences";

type AppearancePanelProps = {
  onChange?: (patch: Partial<ReaderPreferences>) => void;
  preferences: ReaderPreferences;
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

export function AppearancePanel({ onChange, preferences }: AppearancePanelProps) {
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
