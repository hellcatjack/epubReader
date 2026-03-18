import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { db, resetDb } from "../../lib/db/appDb";
import { createDefaultSettings, getSettings } from "./settingsRepository";
import { SettingsDialog } from "./SettingsDialog";

function buildVoice(name: string, lang = "en-US", defaultValue = false): SpeechSynthesisVoice {
  return {
    default: defaultValue,
    lang,
    localService: false,
    name,
    voiceURI: name,
  };
}

function installSpeechSynthesis(voices: SpeechSynthesisVoice[]) {
  const listeners = new Map<string, Array<() => void>>();
  const speechSynthesis = {
    addEventListener: vi.fn((type: string, callback: () => void) => {
      const callbacks = listeners.get(type) ?? [];
      callbacks.push(callback);
      listeners.set(type, callbacks);
    }),
    cancel: vi.fn(),
    getVoices: vi.fn(() => voices),
    pause: vi.fn(),
    pending: false,
    removeEventListener: vi.fn((type: string, callback: () => void) => {
      const callbacks = listeners.get(type) ?? [];
      listeners.set(
        type,
        callbacks.filter((item) => item !== callback),
      );
    }),
    resume: vi.fn(),
    speak: vi.fn(),
    speaking: false,
  } as unknown as SpeechSynthesis;

  vi.stubGlobal("speechSynthesis", speechSynthesis);
  vi.stubGlobal("SpeechSynthesisUtterance", class {
    text: string;
    constructor(text: string) {
      this.text = text;
    }
  });

  return speechSynthesis;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await resetDb();
});

it("does not include a localhost helper url in default settings", () => {
  const keys = Object.keys(createDefaultSettings("192.168.1.31"));

  expect(createDefaultSettings("192.168.1.31")).toMatchObject({
    ttsRate: 1,
    ttsVoice: "",
    ttsVolume: 1,
  });
  expect(keys.some((key) => /helper/i.test(key))).toBe(false);
});

it("persists browser tts settings without rendering a helper url field", async () => {
  const user = userEvent.setup();
  installSpeechSynthesis([
    buildVoice("Microsoft Ava Online (Natural)", "en-US", true),
    buildVoice("Microsoft Andrew Online (Natural)", "en-US"),
  ]);

  render(<SettingsDialog />);

  const targetLanguage = await screen.findByLabelText(/target language/i);
  const theme = screen.getByLabelText(/theme/i);
  const readingMode = screen.getByLabelText(/reading mode/i);
  const ttsVoice = await screen.findByRole("combobox", { name: /tts voice/i });
  const ttsRate = screen.getByLabelText(/tts rate/i);
  const ttsVolume = screen.getByLabelText(/tts volume/i);

  expect(screen.queryByLabelText(/tts helper url/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/font scale/i)).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /advanced typography/i }));

  const fontScale = await screen.findByLabelText(/font scale/i);
  const lineHeight = screen.getByLabelText(/line height/i);
  const letterSpacing = screen.getByLabelText(/letter spacing/i);
  const paragraphSpacing = screen.getByLabelText(/paragraph spacing/i);
  const paragraphIndent = screen.getByLabelText(/paragraph indent/i);
  const contentPadding = screen.getByLabelText(/page padding/i);
  const maxLineWidth = screen.getByLabelText(/max line width/i);
  const columnCount = screen.getByLabelText(/column count/i);
  const fontFamily = screen.getByLabelText(/font family/i);

  await user.selectOptions(targetLanguage, "zh-CN");
  await user.selectOptions(theme, "dark");
  await user.selectOptions(readingMode, "paginated");
  await user.clear(fontScale);
  await user.type(fontScale, "1.2");
  await user.clear(lineHeight);
  await user.type(lineHeight, "1.9");
  await user.clear(letterSpacing);
  await user.type(letterSpacing, "0.03");
  await user.clear(paragraphSpacing);
  await user.type(paragraphSpacing, "1.1");
  await user.clear(paragraphIndent);
  await user.type(paragraphIndent, "2");
  await user.clear(contentPadding);
  await user.type(contentPadding, "40");
  await user.clear(maxLineWidth);
  await user.type(maxLineWidth, "780");
  await user.selectOptions(columnCount, "2");
  await user.selectOptions(fontFamily, "book");
  await user.selectOptions(ttsVoice, "Microsoft Andrew Online (Natural)");
  await user.clear(ttsRate);
  await user.type(ttsRate, "1.15");
  await user.clear(ttsVolume);
  await user.type(ttsVolume, "0.9");
  await user.click(screen.getByRole("button", { name: /save settings/i }));

  await expect(getSettings()).resolves.toMatchObject({
    apiKey: "",
    targetLanguage: "zh-CN",
    theme: "dark",
    readingMode: "paginated",
    fontScale: 1.2,
    lineHeight: 1.9,
    letterSpacing: 0.03,
    paragraphSpacing: 1.1,
    paragraphIndent: 2,
    contentPadding: 40,
    maxLineWidth: 780,
    columnCount: 1,
    fontFamily: "book",
    ttsRate: 1.15,
    ttsVoice: "Microsoft Andrew Online (Natural)",
    ttsVolume: 0.9,
  });
});

it("shows common settings first and reveals advanced typography on demand", async () => {
  installSpeechSynthesis([buildVoice("Microsoft Ava Online (Natural)", "en-US", true)]);

  render(<SettingsDialog />);

  expect(await screen.findByLabelText(/target language/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/tts voice/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/paragraph spacing/i)).not.toBeInTheDocument();

  await userEvent.setup().click(screen.getByRole("button", { name: /advanced typography/i }));

  expect(await screen.findByLabelText(/paragraph spacing/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/max line width/i)).toBeInTheDocument();
});

it("shows single-column paginated mode in the settings UI without deleting the saved scrolled preference", async () => {
  installSpeechSynthesis([buildVoice("Microsoft Ava Online (Natural)", "en-US", true)]);
  await db.settings.put({
    id: "settings",
    apiKey: "",
    targetLanguage: "zh-CN",
    targetLanguageCustomized: false,
    theme: "sepia",
    ttsRate: 1,
    ttsVoice: "",
    ttsVolume: 1,
    fontScale: 1,
    readingMode: "paginated",
    lineHeight: 1.7,
    letterSpacing: 0,
    paragraphSpacing: 0.85,
    paragraphIndent: 1.8,
    contentPadding: 32,
    maxLineWidth: 760,
    columnCount: 2,
    fontFamily: "book",
  });

  render(<SettingsDialog />);

  await userEvent.setup().click(await screen.findByRole("button", { name: /advanced typography/i }));
  const columnCount = await screen.findByLabelText(/column count/i);
  expect(columnCount).toBeDisabled();
  expect(columnCount).toHaveValue("1");

  await expect(getSettings()).resolves.toMatchObject({
    readingMode: "paginated",
    columnCount: 2,
  });
});
