import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { db, resetDb } from "../../lib/db/appDb";
import { defaultSettings, getSettings, saveSettings } from "./settingsRepository";

afterEach(async () => {
  await resetDb();
});

it("provides safe defaults for openai-compatible authentication and reasoning", () => {
  expect(defaultSettings).toMatchObject({
    grammarLlmApiKey: "",
    grammarLlmReasoningEffort: "default",
    llmApiKey: "",
  });
});

it("migrates legacy settings with openai-compatible authentication defaults", async () => {
  const legacySettings = { ...defaultSettings } as Record<string, unknown>;
  delete legacySettings.grammarLlmApiKey;
  delete legacySettings.grammarLlmReasoningEffort;
  delete legacySettings.llmApiKey;
  await db.settings.put({ id: "settings", ...legacySettings } as never);

  await expect(getSettings()).resolves.toMatchObject({
    grammarLlmApiKey: "",
    grammarLlmReasoningEffort: "default",
    llmApiKey: "",
  });
});

it("persists openai-compatible tokens and grammar reasoning effort", async () => {
  await saveSettings({
    grammarLlmApiKey: "grammar-token",
    grammarLlmReasoningEffort: "high",
    llmApiKey: "translation-token",
  } as never);

  await expect(getSettings()).resolves.toMatchObject({
    grammarLlmApiKey: "grammar-token",
    grammarLlmReasoningEffort: "high",
    llmApiKey: "translation-token",
  });
});

it("normalizes an unsupported grammar reasoning effort during migration", async () => {
  await db.settings.put({
    id: "settings",
    ...defaultSettings,
    grammarLlmReasoningEffort: "extreme",
  } as never);

  await expect(getSettings()).resolves.toMatchObject({
    grammarLlmReasoningEffort: "default",
  });
});
