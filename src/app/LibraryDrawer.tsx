import type { PropsWithChildren } from "react";

type LibraryDrawerProps = PropsWithChildren<{
  open: boolean;
  onClose: () => void;
}>;

export function LibraryDrawer({ children, onClose, open }: LibraryDrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="library-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        aria-label="Library drawer"
        aria-modal="true"
        className="library-drawer"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="library-drawer-header">
          <div>
            <p className="library-drawer-eyebrow">Library</p>
            <h2>Your library</h2>
          </div>
          <button type="button" className="reader-app-nav-button" onClick={onClose}>
            Close library
          </button>
        </div>
        <div className="library-drawer-body">{children}</div>
      </aside>
    </div>
  );
}
