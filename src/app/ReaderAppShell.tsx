import { Outlet } from "react-router-dom";
import type { ReaderAppShellContext } from "./readerAppShellContext";

const shellContext: ReaderAppShellContext = {};

export function ReaderAppShell() {
  return (
    <>
      <header aria-label="Reader app navigation" role="banner">
        <button type="button">Library</button>
        <button type="button">Import EPUB</button>
        <button type="button">Settings</button>
      </header>
      <Outlet context={shellContext} />
    </>
  );
}
