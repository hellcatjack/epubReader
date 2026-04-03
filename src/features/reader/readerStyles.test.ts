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
});
