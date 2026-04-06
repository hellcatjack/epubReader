import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readerCss = readFileSync(resolve(process.cwd(), "src/features/reader/reader.css"), "utf8");

describe("reader stage background styles", () => {
  it("uses the reader page background variable for the epub viewport shell", () => {
    expect(readerCss).toMatch(/\.epub-viewport\s*\{[\s\S]*background:\s*var\(--reader-page-background/i);
  });

  it("does not override the epub viewport background in theme-dark", () => {
    expect(readerCss).not.toContain(".reader-layout.theme-dark .epub-viewport");
  });

  it("renders the grammar popup at the expanded two-column width", () => {
    expect(readerCss).toMatch(/\.reader-grammar-popup\s*\{[\s\S]*width:\s*min\(52rem,\s*calc\(100vw - 2rem\)\)/i);
  });

  it("renders the grammar popup at the expanded double-height limits", () => {
    expect(readerCss).toMatch(/\.reader-grammar-popup\s*\{[\s\S]*max-height:\s*min\(84vh,\s*84rem\)/i);
    expect(readerCss).toMatch(/\.reader-grammar-popup-body\s*\{[\s\S]*max-height:\s*min\(84vh,\s*44rem\)/i);
  });

  it("uses the spoken sentence note font scale for grammar popup body text", () => {
    expect(readerCss).toMatch(
      /\.reader-grammar-popup-(?:body|list-item|placeholder|error|paragraph)\s*\{[\s\S]*font-size:\s*calc\(0\.95rem \* var\(--reader-tts-sentence-note-text-scale,\s*1\)\)/i,
    );
  });
});
