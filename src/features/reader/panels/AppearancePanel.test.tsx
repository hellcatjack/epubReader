import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AppearancePanel } from "./AppearancePanel";

it("renders a page background color input and emits updates", () => {
  const onChange = vi.fn();

  render(
    <AppearancePanel
      onChange={onChange}
      preferences={{
        columnCount: 1,
        contentPadding: 32,
        contentBackgroundColor: "#f6edde",
        fontFamily: "book",
        fontScale: 1,
        letterSpacing: 0,
        lineHeight: 1.7,
        maxLineWidth: 760,
        paragraphIndent: 1.8,
        paragraphSpacing: 0.85,
        readingMode: "scrolled",
        theme: "sepia",
      }}
    />,
  );

  const input = screen.getByLabelText(/page background/i);
  expect(input).toHaveValue("#f6edde");

  fireEvent.change(input, { target: { value: "#c0ffee" } });

  expect(onChange).toHaveBeenCalledWith({ contentBackgroundColor: "#c0ffee" });
});

it("renders an llm api url input and emits direct updates", () => {
  const onLlmApiUrlChange = vi.fn();

  render(
    <AppearancePanel
      llmApiUrl="http://localhost:8001/v1/chat/completions"
      onLlmApiUrlChange={onLlmApiUrlChange}
      preferences={{
        columnCount: 1,
        contentPadding: 32,
        contentBackgroundColor: "#f6edde",
        fontFamily: "book",
        fontScale: 1,
        letterSpacing: 0,
        lineHeight: 1.7,
        maxLineWidth: 760,
        paragraphIndent: 1.8,
        paragraphSpacing: 0.85,
        readingMode: "scrolled",
        theme: "sepia",
      }}
    />,
  );

  const input = screen.getByLabelText(/llm api url/i);
  expect(input).toHaveValue("http://localhost:8001/v1/chat/completions");

  fireEvent.change(input, { target: { value: "http://localhost:1234/v1" } });

  expect(onLlmApiUrlChange).toHaveBeenCalledWith("http://localhost:1234/v1");
});
