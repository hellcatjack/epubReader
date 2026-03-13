import "./reader.css";
import { EpubViewport } from "./EpubViewport";
import { LeftRail } from "./LeftRail";
import { RightPanel } from "./RightPanel";
import { SelectionPopover } from "./SelectionPopover";
import { TopBar } from "./TopBar";

export function ReaderPage() {
  return (
    <main className="reader-layout">
      <LeftRail />
      <section className="reader-center" aria-label="Reading workspace">
        <TopBar />
        <EpubViewport />
        <SelectionPopover />
      </section>
      <RightPanel aria-label="Reader tools" />
    </main>
  );
}
