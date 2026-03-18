import type { PropsWithChildren } from "react";

type SettingsPanelProps = PropsWithChildren<{
  open: boolean;
  onClose: () => void;
}>;

export function SettingsPanel({ children, onClose, open }: SettingsPanelProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="settings-panel-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label="Reader settings panel"
        className="settings-panel-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-panel-topbar">
          <div>
            <p className="settings-dialog-eyebrow">Library controls</p>
            <h2>Reader settings</h2>
          </div>
          <button type="button" className="settings-toggle" onClick={onClose}>
            Close settings
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
