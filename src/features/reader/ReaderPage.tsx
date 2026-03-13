import "./reader.css";
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
        <section className="reader-viewport-shell" aria-label="Book content">
          <div className="reader-page-card">
            <p className="reader-eyebrow">Current chapter</p>
            <h1 className="reader-title">Demo Reader</h1>
            <p className="reader-copy">
              The EPUB viewport will mount here in the next task. This shell keeps the
              page layout, bookmark action, and reader-side tools in place.
            </p>
          </div>
        </section>
        <SelectionPopover />
      </section>
      <RightPanel aria-label="Reader tools" />
    </main>
  );
}
