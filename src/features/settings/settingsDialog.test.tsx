import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { db, resetDb } from "../../lib/db/appDb";
import { createDefaultSettings, defaultSettings, getSettings } from "./settingsRepository";
import { SettingsDialog } from "./SettingsDialog";

const { resetLocalAppStateMock } = vi.hoisted(() => ({
  resetLocalAppStateMock: vi.fn(async () => undefined),
}));

vi.mock("./resetLocalAppState", () => ({
  resetLocalAppState: resetLocalAppStateMock,
}));

const DEFAULT_TEST_LLM_API_URL = "http://localhost:8001/v1/chat/completions";

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

function createStoredSettings(overrides: Partial<typeof defaultSettings> = {}) {
  return {
    id: "settings" as const,
    ...defaultSettings,
    ...overrides,
  };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  resetLocalAppStateMock.mockReset();
  await resetDb();
});

it("includes a configurable llm api url in default settings", () => {
  const keys = Object.keys(createDefaultSettings("localhost"));

  expect(createDefaultSettings("localhost")).toMatchObject({
    geminiModel: "gemini-2.5-flash",
    llmApiUrl: "http://localhost:8001/v1/chat/completions",
    localLlmModel: "",
    ttsSentenceTranslationFontScale: 1,
    ttsFollowPlayback: false,
    ttsRate: 1,
    ttsVoice: "",
    ttsVolume: 1,
    translationProvider: "local_llm",
  });
  expect(keys.some((key) => /llmapiurl/i.test(key))).toBe(true);
});

it("persists browser tts settings and local llm provider configuration", async () => {
  const user = userEvent.setup();
  installSpeechSynthesis([
    buildVoice("Microsoft Ava Online (Natural)", "en-US", true),
    buildVoice("Microsoft Andrew Online (Natural)", "en-US"),
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      async () =>
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

  render(<SettingsDialog />);

  const targetLanguage = await screen.findByLabelText(/target language/i);
  const translationProvider = screen.getByLabelText(/translation provider/i);
  const theme = screen.getByLabelText(/theme/i);
  const readingMode = screen.getByLabelText(/reading mode/i);
  const ttsVoice = await screen.findByRole("combobox", { name: /tts voice/i });
  const ttsRate = screen.getByLabelText(/tts rate/i);
  const ttsVolume = screen.getByLabelText(/tts volume/i);
  const ttsFollowPlayback = screen.getByRole("checkbox", { name: /follow tts playback/i });
  const llmApiUrl = screen.getByLabelText(/llm api url/i);
  const localLlmModel = await screen.findByRole("combobox", { name: /local llm model/i });
  await screen.findByRole("option", { name: "phi-4-mini" });

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
  const pageBackground = screen.getByLabelText(/page background/i);
  const ttsNoteSize = screen.getByLabelText(/now reading text size/i);

  await user.selectOptions(targetLanguage, "zh-CN");
  await user.selectOptions(translationProvider, "local_llm");
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
  await user.clear(ttsNoteSize);
  await user.type(ttsNoteSize, "1.35");
  fireEvent.change(pageBackground, { target: { value: "#c0ffee" } });
  await user.selectOptions(columnCount, "2");
  await user.selectOptions(fontFamily, "book");
  await user.selectOptions(ttsVoice, "Microsoft Andrew Online (Natural)");
  await user.click(ttsFollowPlayback);
  await user.clear(llmApiUrl);
  await user.type(llmApiUrl, "http://localhost:1234/v1");
  await user.selectOptions(localLlmModel, "phi-4-mini");
  await user.clear(ttsRate);
  await user.type(ttsRate, "1.15");
  await user.clear(ttsVolume);
  await user.type(ttsVolume, "0.9");
  await user.click(screen.getByRole("button", { name: /save settings/i }));

  await expect(getSettings()).resolves.toMatchObject({
    apiKey: "",
    geminiModel: "gemini-2.5-flash",
    llmApiUrl: "http://localhost:1234/v1",
    localLlmModel: "phi-4-mini",
    targetLanguage: "zh-CN",
    theme: "dark",
    translationProvider: "local_llm",
    readingMode: "paginated",
    fontScale: 1.2,
    lineHeight: 1.9,
    letterSpacing: 0.03,
    paragraphSpacing: 1.1,
    paragraphIndent: 2,
    contentPadding: 40,
    contentBackgroundColor: "#c0ffee",
    maxLineWidth: 780,
    columnCount: 1,
    fontFamily: "book",
    ttsSentenceTranslationFontScale: 1.35,
    ttsRate: 1.15,
    ttsFollowPlayback: true,
    ttsVoice: "Microsoft Andrew Online (Natural)",
    ttsVolume: 0.9,
  });
});

it("switches to gemini byok fields and persists the gemini provider settings", async () => {
  const user = userEvent.setup();
  installSpeechSynthesis([buildVoice("Microsoft Ava Online (Natural)", "en-US", true)]);

  render(<SettingsDialog />);

  const translationProvider = await screen.findByLabelText(/translation provider/i);
  await user.selectOptions(translationProvider, "gemini_byok");

  const geminiApiKey = await screen.findByLabelText(/gemini api key/i);
  const geminiModel = screen.getByRole("combobox", { name: /gemini model/i });

  expect(screen.queryByLabelText(/llm api url/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: /local llm model/i })).not.toBeInTheDocument();

  await user.type(geminiApiKey, "gemini-test-key");
  await user.selectOptions(geminiModel, "gemini-2.5-flash-lite");
  await user.click(screen.getByRole("button", { name: /save settings/i }));

  await expect(getSettings()).resolves.toMatchObject({
    apiKey: "gemini-test-key",
    geminiModel: "gemini-2.5-flash-lite",
    translationProvider: "gemini_byok",
  });
});

it("shows common settings first and reveals advanced typography on demand", async () => {
  installSpeechSynthesis([buildVoice("Microsoft Ava Online (Natural)", "en-US", true)]);

  render(<SettingsDialog />);

  expect(await screen.findByLabelText(/target language/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/tts voice/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/paragraph spacing/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/now reading text size/i)).not.toBeInTheDocument();

  await userEvent.setup().click(screen.getByRole("button", { name: /advanced typography/i }));

  expect(await screen.findByLabelText(/paragraph spacing/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/page background/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/max line width/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/now reading text size/i)).toBeInTheDocument();
});

it("shows local troubleshooting details and lets the user reset local app data", async () => {
  const user = userEvent.setup();
  installSpeechSynthesis([buildVoice("Microsoft Ava Online (Natural)", "en-US", true)]);
  await db.settings.put(
    createStoredSettings({
      llmApiUrl: "http://192.168.1.31:8001/v1/chat/completions",
      localLlmModel: "tencent/HY-MT1.5-7B-GGUF:Q4_K_M",
      translationProvider: "local_llm",
    }),
  );

  render(<SettingsDialog />);

  const troubleshooting = await screen.findByLabelText(/local troubleshooting/i);
  expect(within(troubleshooting).getByText(/current build/i)).toBeInTheDocument();
  expect(within(troubleshooting).getByText(/current ai configuration/i)).toBeInTheDocument();
  expect(within(troubleshooting).getByText(/tencent\/HY-MT1\.5-7B-GGUF:Q4_K_M/i)).toBeInTheDocument();
  expect(within(troubleshooting).getByText(/192\.168\.1\.31:8001/i)).toBeInTheDocument();

  await user.click(within(troubleshooting).getByRole("button", { name: /reset local app data/i }));

  expect(resetLocalAppStateMock).toHaveBeenCalledTimes(1);
});

it("shows a manual local model input when secure pages cannot auto-discover private-network models", async () => {
  installSpeechSynthesis([buildVoice("Microsoft Ava Online (Natural)", "en-US", true)]);
  vi.stubGlobal("isSecureContext", true);
  await db.settings.put(
    createStoredSettings({
      llmApiUrl: "http://192.168.1.31:8001/v1/chat/completions",
      translationProvider: "local_llm",
    }),
  );

  render(<SettingsDialog />);

  expect(await screen.findByRole("textbox", { name: /local llm model/i })).toBeInTheDocument();
  expect(
    screen.getByText(/cannot auto-discover models from http private-network endpoints/i),
  ).toBeInTheDocument();
});

it("shows single-column paginated mode in the settings UI without deleting the saved scrolled preference", async () => {
  installSpeechSynthesis([buildVoice("Microsoft Ava Online (Natural)", "en-US", true)]);
  await db.settings.put(createStoredSettings({
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
    contentBackgroundColor: "#f6edde",
    maxLineWidth: 760,
    columnCount: 2,
    fontFamily: "book",
    llmApiUrl: DEFAULT_TEST_LLM_API_URL,
  }));

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
