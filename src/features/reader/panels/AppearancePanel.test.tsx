import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AppearancePanel } from "./AppearancePanel";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
        ttsSentenceTranslationFontScale: 1,
      }}
    />,
  );

  const input = screen.getByLabelText(/page background/i);
  expect(input).toHaveValue("#f6edde");

  fireEvent.change(input, { target: { value: "#c0ffee" } });

  expect(onChange).toHaveBeenCalledWith({ contentBackgroundColor: "#c0ffee" });
});

it("renders a now reading text size input and emits updates", () => {
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
        ttsSentenceTranslationFontScale: 1,
      }}
    />,
  );

  const input = screen.getByLabelText(/now reading text size/i);
  expect(input).toHaveValue(1);

  fireEvent.change(input, { target: { value: "1.3" } });

  expect(onChange).toHaveBeenCalledWith({ ttsSentenceTranslationFontScale: 1.3 });
});

it("renders an llm api url input and emits direct updates", () => {
  const onLlmApiUrlChange = vi.fn();
  const onLocalLlmModelChange = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: "local-reader-chat" }, { id: "phi-4-mini" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    ),
  );

  render(
    <AppearancePanel
      llmApiUrl="http://localhost:8001/v1/chat/completions"
      onLlmApiUrlChange={onLlmApiUrlChange}
      onLocalLlmModelChange={onLocalLlmModelChange}
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
        ttsSentenceTranslationFontScale: 1,
      }}
    />,
  );

  const input = screen.getByLabelText(/llm api url/i);
  expect(input).toHaveValue("http://localhost:8001/v1/chat/completions");

  fireEvent.change(input, { target: { value: "http://localhost:1234/v1" } });

  expect(onLlmApiUrlChange).toHaveBeenCalledWith("http://localhost:1234/v1");
  expect(screen.getByRole("combobox", { name: /local llm model/i })).toBeInTheDocument();
});

it("switches to gemini byok controls inside the appearance panel", () => {
  const onTranslationProviderChange = vi.fn();
  const onApiKeyChange = vi.fn();
  const onGeminiModelChange = vi.fn();

  render(
    <AppearancePanel
      apiKey="gemini-secret"
      geminiModel="gemini-2.5-flash-lite"
      onApiKeyChange={onApiKeyChange}
      onGeminiModelChange={onGeminiModelChange}
      onTranslationProviderChange={onTranslationProviderChange}
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
        ttsSentenceTranslationFontScale: 1,
      }}
      translationProvider="gemini_byok"
    />,
  );

  expect(screen.queryByLabelText(/llm api url/i)).not.toBeInTheDocument();
  expect(screen.getByLabelText(/gemini api key/i)).toHaveValue("gemini-secret");
  expect(screen.getByRole("combobox", { name: /gemini model/i })).toHaveValue("gemini-2.5-flash-lite");

  fireEvent.change(screen.getByLabelText(/gemini api key/i), { target: { value: "new-gemini-key" } });
  fireEvent.change(screen.getByRole("combobox", { name: /gemini model/i }), {
    target: { value: "gemini-2.5-flash" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: /translation provider/i }), {
    target: { value: "local_llm" },
  });

  expect(onApiKeyChange).toHaveBeenCalledWith("new-gemini-key");
  expect(onGeminiModelChange).toHaveBeenCalledWith("gemini-2.5-flash");
  expect(onTranslationProviderChange).toHaveBeenCalledWith("local_llm");
});

it("shows a manual local model input when secure pages cannot auto-discover private-network models", async () => {
  vi.stubGlobal("isSecureContext", true);

  render(
    <AppearancePanel
      llmApiUrl="http://192.168.1.31:8001/v1/chat/completions"
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
        ttsSentenceTranslationFontScale: 1,
      }}
    />,
  );

  expect(await screen.findByRole("textbox", { name: /local llm model/i })).toBeInTheDocument();
  expect(
    screen.getByText(/cannot auto-discover models from http private-network endpoints/i),
  ).toBeInTheDocument();
});
