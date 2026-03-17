import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { resetDb } from "../../lib/db/appDb";
import { createDefaultSettings, getSettings, migrateLegacyTtsHelperUrl } from "./settingsRepository";
import { SettingsDialog } from "./SettingsDialog";

afterEach(async () => {
  vi.unstubAllGlobals();
  await resetDb();
});

it("defaults to the current host for kokoro tts settings", async () => {
  expect(createDefaultSettings("192.168.1.31")).toMatchObject({
    ttsHelperUrl: "http://192.168.1.31:43115",
    ttsVoice: "af_heart",
    ttsRate: 1,
    ttsVolume: 1,
  });
});

it("migrates legacy localhost tts helper urls to the current reader host", () => {
  expect(migrateLegacyTtsHelperUrl("http://127.0.0.1:43115", "192.168.1.31")).toBe("http://192.168.1.31:43115");
  expect(migrateLegacyTtsHelperUrl("http://localhost:43115", "192.168.1.31")).toBe("http://192.168.1.31:43115");
  expect(migrateLegacyTtsHelperUrl("http://192.168.1.31:43115", "192.168.1.31")).toBe("http://192.168.1.31:43115");
});

it("persists target language, theme, reading mode, typography settings, and local tts helper fields", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify([
        {
          id: "af_heart",
          displayName: "Heart",
          locale: "en-US",
          gender: "female",
          isDefault: true,
        },
        {
          id: "am_michael",
          displayName: "Michael",
          locale: "en-US",
          gender: "male",
          isDefault: false,
        },
      ]),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);

  render(<SettingsDialog />);

  const targetLanguage = await screen.findByLabelText(/target language/i);
  const theme = screen.getByLabelText(/theme/i);
  const readingMode = screen.getByLabelText(/reading mode/i);
  const fontScale = screen.getByLabelText(/font scale/i);
  const lineHeight = screen.getByLabelText(/line height/i);
  const letterSpacing = screen.getByLabelText(/letter spacing/i);
  const paragraphSpacing = screen.getByLabelText(/paragraph spacing/i);
  const paragraphIndent = screen.getByLabelText(/paragraph indent/i);
  const contentPadding = screen.getByLabelText(/page padding/i);
  const maxLineWidth = screen.getByLabelText(/max line width/i);
  const columnCount = screen.getByLabelText(/column count/i);
  const fontFamily = screen.getByLabelText(/font family/i);
  const ttsHelperUrl = screen.getByLabelText(/tts helper url/i);
  const ttsVoice = await screen.findByRole("combobox", { name: /tts voice/i });
  const ttsRate = screen.getByLabelText(/tts rate/i);
  const ttsVolume = screen.getByLabelText(/tts volume/i);

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
  await user.clear(ttsHelperUrl);
  await user.type(ttsHelperUrl, "http://127.0.0.1:43115");
  await user.selectOptions(ttsVoice, "am_michael");
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
    columnCount: 2,
    fontFamily: "book",
    ttsHelperUrl: "http://127.0.0.1:43115",
    ttsRate: 1.15,
    ttsVoice: "am_michael",
    ttsVolume: 0.9,
  });
});
