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

it("keeps the tts control buttons above the current text summary", () => {
  render(<TtsStatusPanel currentText="Current paragraph" />);

  const controls = screen.getByRole("group", { name: /tts controls/i });
  const summary = screen.getByText("Current paragraph").closest(".reader-tts-current");

  expect(summary).not.toBeNull();
  expect(controls.compareDocumentPosition(summary as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("lets the reader toggle follow playback from the advanced tts section", async () => {
  const user = userEvent.setup();
  const onFollowPlaybackChange = vi.fn();

  render(<TtsStatusPanel followPlayback={false} onFollowPlaybackChange={onFollowPlaybackChange} />);

  await user.click(screen.getByRole("button", { name: /voice, speed, volume/i }));
  await user.click(screen.getByRole("checkbox", { name: /follow tts playback/i }));

  expect(onFollowPlaybackChange).toHaveBeenCalledWith(true);
});

it("lets the reader toggle spoken sentence translation notes from the advanced tts section", async () => {
  const user = userEvent.setup();
  const onSentenceTranslationEnabledChange = vi.fn();

  render(
    <TtsStatusPanel
      onSentenceTranslationEnabledChange={onSentenceTranslationEnabledChange}
      sentenceTranslationEnabled={false}
    />,
  );

  await user.click(screen.getByRole("button", { name: /voice, speed, volume/i }));
  await user.click(screen.getByRole("checkbox", { name: /show tts translation note/i }));

  expect(onSentenceTranslationEnabledChange).toHaveBeenCalledWith(true);
});
