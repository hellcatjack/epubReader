import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiResultPanel } from "./AiResultPanel";

describe("AiResultPanel", () => {
  it("renders translation metadata and result in separate surfaces", () => {
    render(
      <AiResultPanel
        title="Translation"
        selectedText="pressed"
        ipa="/prest/"
        result="按压的；紧迫的。"
      />,
    );

    const panel = screen.getByLabelText("AI result");
    expect(panel.querySelector(".reader-ai-meta")).not.toBeNull();
    expect(panel.querySelector(".reader-ai-result")).not.toBeNull();
    expect(screen.getByText("Selection")).toBeInTheDocument();
    expect(screen.getByText("IPA")).toBeInTheDocument();
  });

  it("omits the ipa row for non-single-word translation results", () => {
    render(<AiResultPanel title="Translation" selectedText="pressed flowers" result="压制花" />);

    expect(screen.queryByText("IPA")).toBeNull();
  });
});
