import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { TtsStatusPanel } from "./TtsStatusPanel";

it("renders voice rate and volume controls inside the advanced tts section", async () => {
  const user = userEvent.setup();

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

  await user.click(screen.getByRole("button", { name: /voice, speed, volume/i }));

  const settingsGroup = screen.getByRole("group", { name: /tts settings/i });
  expect(within(settingsGroup).getByLabelText(/tts voice/i)).toBeInTheDocument();
  expect(within(settingsGroup).getByLabelText(/^tts rate$/i)).toBeInTheDocument();
  expect(within(settingsGroup).getByLabelText(/tts volume/i)).toBeInTheDocument();
});

it("keeps advanced tts settings collapsed until the reader expands them", async () => {
  const user = userEvent.setup();

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

  expect(screen.queryByRole("group", { name: /tts settings/i })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /voice, speed, volume/i }));

  const settingsGroup = screen.getByRole("group", { name: /tts settings/i });
  expect(within(settingsGroup).getByLabelText(/tts voice/i)).toBeInTheDocument();
  expect(within(settingsGroup).getByLabelText(/^tts rate$/i)).toBeInTheDocument();
  expect(within(settingsGroup).getByLabelText(/tts volume/i)).toBeInTheDocument();
});

it("captures the current selection on start tts pointer down before the button click runs", () => {
  const onStartPointerDown = vi.fn();

  render(<TtsStatusPanel onStartPointerDown={onStartPointerDown} />);

  fireEvent.mouseDown(screen.getByRole("button", { name: /start tts/i }));

  expect(onStartPointerDown).toHaveBeenCalledTimes(1);
});

it("lets the reader toggle follow playback from the advanced tts section", async () => {
  const user = userEvent.setup();
  const onFollowPlaybackChange = vi.fn();

  render(<TtsStatusPanel followPlayback={false} onFollowPlaybackChange={onFollowPlaybackChange} />);

  await user.click(screen.getByRole("button", { name: /voice, speed, volume/i }));
  await user.click(screen.getByRole("checkbox", { name: /follow tts playback/i }));

  expect(onFollowPlaybackChange).toHaveBeenCalledWith(true);
});
