import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TtsStatusPanel } from "./TtsStatusPanel";

describe("TtsStatusPanel", () => {
  it("shows a clearer label while audio is being generated", () => {
    render(<TtsStatusPanel status="loading" currentText="First chunk." />);

    expect(screen.getByText(/tts status: generating audio/i)).toBeInTheDocument();
  });
});
