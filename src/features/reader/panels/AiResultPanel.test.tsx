import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiResultPanel } from "./AiResultPanel";

describe("AiResultPanel", () => {
  it("renders translation metadata and result in separate surfaces", () => {
    render(
      <AiResultPanel
        {...({
          explanation: "中文解释：表示被压住或紧迫。\n\nEnglish explanation: describes pressure or urgency.",
          ipa: "/prest/",
          selectedText: "pressed",
          translation: "按压的；紧迫的。",
        } as Record<string, unknown>)}
      />,
    );

    const panel = screen.getByLabelText("AI result");
    expect(panel.querySelector(".reader-ai-meta")).not.toBeNull();
    expect(panel.querySelector(".reader-ai-surface-primary")).not.toBeNull();
    expect(panel.querySelector(".reader-ai-surface-secondary")).not.toBeNull();
    expect(screen.getByText("Selection")).toBeInTheDocument();
    expect(screen.getByText("IPA")).toBeInTheDocument();
    expect(screen.getByText("Translation")).toBeInTheDocument();
    expect(screen.getByText("Explanation")).toBeInTheDocument();
    expect(screen.getByText("按压的；紧迫的。")).toBeInTheDocument();
    expect(screen.getByText(/English explanation:/)).toBeInTheDocument();
  });

  it("omits the ipa row for non-single-word translation results", () => {
    render(
      <AiResultPanel
        {...({
          selectedText: "pressed flowers",
          translation: "压制花",
        } as Record<string, unknown>)}
      />,
    );

    expect(screen.queryByText("IPA")).toBeNull();
  });

  it("shows an explanation placeholder before explain is requested", () => {
    render(
      <AiResultPanel
        {...({
          ipa: "/prest/",
          selectedText: "pressed",
          translation: "按压",
        } as Record<string, unknown>)}
      />,
    );

    expect(screen.getByText("Click Explain for deeper context.")).toBeInTheDocument();
  });
});
