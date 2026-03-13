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

it("persists target language, theme, and font scale in settings", async () => {
  const user = userEvent.setup();

  render(<SettingsDialog />);

  const targetLanguage = await screen.findByLabelText(/target language/i);
  const theme = screen.getByLabelText(/theme/i);
  const fontScale = screen.getByLabelText(/font scale/i);

  await user.selectOptions(targetLanguage, "zh-CN");
  await user.selectOptions(theme, "dark");
  await user.clear(fontScale);
  await user.type(fontScale, "1.2");
  await user.click(screen.getByRole("button", { name: /save settings/i }));

  await expect(getSettings()).resolves.toMatchObject({
    apiKey: "",
    targetLanguage: "zh-CN",
    theme: "dark",
    fontScale: 1.2,
    ttsVoice: "disabled",
  });
});
