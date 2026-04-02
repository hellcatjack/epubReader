import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { RightPanel } from "./RightPanel";
import { defaultReaderPreferences } from "./readerPreferences";

it("keeps the tts queue outside the scrolling reader detail panels", () => {
  render(
    <RightPanel
      appearance={defaultReaderPreferences}
      aria-label="Reader tools"
      explanation="Long explanation"
      selectedText="Selected text"
      translation="Long translation"
      ttsStatus="idle"
    />,
  );

  const tools = screen.getByRole("complementary", { name: /reader tools/i });
  const detailPanels = within(tools).getByRole("group", { name: /reader detail panels/i });

  expect(within(tools).getByRole("heading", { name: /tts queue/i })).toBeInTheDocument();
  expect(within(detailPanels).queryByRole("heading", { name: /tts queue/i })).not.toBeInTheDocument();
  expect(within(detailPanels).getByRole("heading", { name: /reading assistant/i })).toBeInTheDocument();
});

it("wires the reading assistant read-aloud button to the selection playback handler", async () => {
  const user = userEvent.setup();
  const onSelectionReadAloud = vi.fn();

  render(
    <RightPanel
      appearance={defaultReaderPreferences}
      aria-label="Reader tools"
      onSelectionReadAloud={onSelectionReadAloud}
      selectedText="Selected text"
      translation="Long translation"
      ttsStatus="idle"
    />,
  );

  await user.click(screen.getByRole("button", { name: /read selection aloud/i }));

  expect(onSelectionReadAloud).toHaveBeenCalledTimes(1);
});
