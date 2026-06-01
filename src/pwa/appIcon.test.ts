import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pwaManifest } from "./pwaManifest";

function readText(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function readPngSize(relativePath: string) {
  const buffer = readFileSync(join(process.cwd(), relativePath));
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`${relativePath} is not a PNG file`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe("app icon assets", () => {
  it("keeps a source svg and correctly-sized install icons", () => {
    const source = readText("public/icon.svg");

    expect(source).toContain("<svg");
    expect(source).toContain("EPUB Reader");
    expect(readPngSize("public/pwa-192.png")).toEqual({ width: 192, height: 192 });
    expect(readPngSize("public/pwa-512.png")).toEqual({ width: 512, height: 512 });
  });

  it("exposes the project icon through the document head", () => {
    const html = readText("index.html");

    expect(html).toContain('rel="icon"');
    expect(html).toContain('href="/pwa-192.png"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('href="/pwa-512.png"');
  });

  it("declares install icons for standard and maskable launcher usage", () => {
    expect(pwaManifest.icons).toEqual([
      {
        src: "/pwa-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ]);
  });
});
