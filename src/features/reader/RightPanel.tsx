import type { ComponentPropsWithoutRef } from "react";
import { AiResultPanel } from "./panels/AiResultPanel";
import { NoteEditorPanel } from "./panels/NoteEditorPanel";
import { TtsStatusPanel } from "./panels/TtsStatusPanel";

type RightPanelProps = ComponentPropsWithoutRef<"aside">;

export function RightPanel(props: RightPanelProps) {
  return (
    <aside className="reader-tools" {...props}>
      <AiResultPanel />
      <NoteEditorPanel />
      <TtsStatusPanel />
    </aside>
  );
}
