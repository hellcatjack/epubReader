import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { TtsSentenceTranslationNote } from "./TtsSentenceTranslationNote";

it("renders a spoken sentence translation note with a compact label and anchored position", () => {
  render(<TtsSentenceTranslationNote fontScale={1.25} left={32} top={180} translation="挪亚的后代" />);

  const note = screen.getByRole("status", { name: /spoken sentence translation/i });
  expect(note).toHaveTextContent("Now reading");
  expect(note).toHaveTextContent("挪亚的后代");
  expect(note).toHaveStyle({
    "--reader-tts-sentence-note-text-scale": "1.25",
    insetInlineStart: "32px",
    top: "180px",
  });
});
