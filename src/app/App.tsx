import { usePwaStatus } from "../pwa/usePwaStatus";
import { AppRouter } from "./router";
import "./app.css";

export function App() {
  const { applyUpdate, updateAvailable } = usePwaStatus();

  return (
    <>
      {updateAvailable ? (
        <div className="app-update-banner" role="status">
          <p>A new version is ready.</p>
          <button type="button" onClick={() => void applyUpdate?.()}>
            Reload now
          </button>
        </div>
      ) : null}
      <AppRouter />
    </>
  );
}
