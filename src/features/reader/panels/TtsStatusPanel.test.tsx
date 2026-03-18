import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { TtsStatusPanel } from "./TtsStatusPanel";

it("renders voice rate and volume controls inside the tts queue", () => {
  render(
    <TtsStatusPanel
      rate={1}
      status="idle"
      voiceId="ava"
      voices={[
        {
          displayName: "Microsoft Ava Online (Natural)",
          gender: "female",
          id: "ava",
          isDefault: true,
          locale: "en-US",
        },
      ]}
      volume={0.9}
    />,
  );

  const settingsGroup = screen.getByRole("group", { name: /tts settings/i });
  expect(within(settingsGroup).getByLabelText(/tts voice/i)).toBeInTheDocument();
  expect(within(settingsGroup).getByLabelText(/^tts rate$/i)).toBeInTheDocument();
  expect(within(settingsGroup).getByLabelText(/tts volume/i)).toBeInTheDocument();
});
