import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TtsStatusPanel } from "./TtsStatusPanel";

describe("TtsStatusPanel", () => {
  it("shows an edge support warning when browser tts is unsupported", () => {
    render(<TtsStatusPanel error="TTS is optimized for Microsoft Edge on desktop." status="error" />);

    expect(screen.getByText(/optimized for microsoft edge on desktop/i)).toBeInTheDocument();
  });

  it("shows a simpler loading label while the browser starts speaking", () => {
    render(<TtsStatusPanel status="loading" currentText="First chunk." />);

    expect(screen.getByText(/tts status: loading/i)).toBeInTheDocument();
  });

  it("renders quick rate controls in the tts panel", () => {
    render(<TtsStatusPanel {...({ status: "idle", rate: 1 } as never)} />);

    expect(screen.getByRole("button", { name: /0.8x/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1.0x/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1.2x/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1.4x/i })).toBeInTheDocument();
  });
});
