import { Outlet } from "react-router-dom";
import type { ReaderAppShellContext } from "./readerAppShellContext";

const shellContext: ReaderAppShellContext = {};

export function ReaderAppShell() {
  return (
    <div className="reader-app-shell">
      <nav aria-label="Reader app navigation">
        <button type="button">Library</button>
        <button type="button">Import EPUB</button>
        <button type="button">Settings</button>
      </nav>
      <Outlet context={shellContext} />
    </div>
  );
}
