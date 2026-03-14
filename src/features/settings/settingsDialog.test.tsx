import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { resetDb } from "../../lib/db/appDb";
import { getSettings } from "./settingsRepository";
import { SettingsDialog } from "./SettingsDialog";

afterEach(async () => {
  await resetDb();
});

it("persists target language, theme, reading mode, and typography settings", async () => {
  const user = userEvent.setup();

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
    ttsVoice: "disabled",
  });
});
