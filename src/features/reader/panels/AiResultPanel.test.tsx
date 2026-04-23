import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AiResultPanel } from "./AiResultPanel";

describe("AiResultPanel", () => {
  it("renders translation metadata and result without an explanation surface", () => {
    render(
      <AiResultPanel
        {...({
          ipa: "/prest/",
          selectedText: "pressed",
          translation: "按压的；紧迫的。",
        } as Record<string, unknown>)}
      />,
    );

    const panel = screen.getByLabelText("AI result");
    expect(panel.querySelector(".reader-ai-meta")).not.toBeNull();
    expect(panel.querySelector(".reader-ai-surface-primary")).not.toBeNull();
    expect(panel.querySelector(".reader-ai-surface-secondary")).toBeNull();
    expect(screen.getByText("Selection")).toBeInTheDocument();
    expect(screen.getByText("IPA")).toBeInTheDocument();
    expect(screen.getByText("Translation")).toBeInTheDocument();
    expect(screen.getByText("按压的；紧迫的。")).toBeInTheDocument();
  });

  it("keeps the ipa label and value grouped in the left-aligned meta column", () => {
    render(
      <AiResultPanel
        {...({
          ipa: "/prest/",
          selectedText: "pressed",
          translation: "按压",
        } as Record<string, unknown>)}
      />,
    );

    const ipaRow = screen.getByText("IPA").closest(".reader-ai-meta-row");
    expect(ipaRow?.querySelector(".reader-ai-meta-main")).not.toBeNull();
    expect(ipaRow?.querySelector(".reader-ai-meta-main")?.textContent).toContain("/prest/");
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

  it("shows a compact read aloud button beside the current selection", async () => {
    const user = userEvent.setup();
    const onReadAloud = vi.fn();

    render(
      <AiResultPanel
        {...({
          onReadAloud,
          selectedText: "pressed",
          translation: "按压",
        } as Record<string, unknown>)}
      />,
    );

    const selectionRow = screen.getByText("Selection").closest(".reader-ai-meta-row");
    expect(selectionRow).not.toBeNull();
    const button = screen.getByRole("button", { name: /read selection aloud/i });
    expect(selectionRow).toContainElement(button);

    await user.click(button);

    expect(onReadAloud).toHaveBeenCalledTimes(1);
  });

  it("renders an english definition surface below translation when provided", () => {
    render(
      <AiResultPanel
        {...({
          englishDefinition: "to press something down; to force into a place",
          selectedText: "pressed",
          translation: "按压",
        } as Record<string, unknown>)}
      />,
    );

    expect(screen.getByText("English definition")).toBeInTheDocument();
    expect(screen.getByText("to press something down; to force into a place")).toBeInTheDocument();
  });
});
