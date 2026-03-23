import { expect, it, vi } from "vitest";
import { defaultSettings } from "../settings/settingsRepository";
import { createAiService } from "./aiService";

it("uses the saved llm api url when creating the ai adapter", async () => {
  const translateSelection = vi.fn().mockResolvedValue("翻译");
  const explainSelection = vi.fn().mockResolvedValue("解释");
  const synthesizeSpeech = vi.fn().mockResolvedValue({ audio: "" });
  const loadSettings = vi.fn().mockResolvedValue({
    ...defaultSettings,
    llmApiUrl: "http://localhost:1234/v1",
  });
  const createAdapter = vi.fn().mockReturnValue({
    explainSelection,
    synthesizeSpeech,
    translateSelection,
  });
  const service = createAiService({ createAdapter, loadSettings });

  await expect(service.translateSelection("hello", { targetLanguage: "zh-CN" })).resolves.toBe("翻译");

  expect(loadSettings).toHaveBeenCalledTimes(1);
  expect(createAdapter).toHaveBeenCalledWith({ endpoint: "http://localhost:1234/v1" });
  expect(translateSelection).toHaveBeenCalledWith("hello", { targetLanguage: "zh-CN" });
});
