import { describe, expect, it } from "vitest";
import { findTtsBlockElementByText, getNearestTtsBlockElement } from "./epubRuntime";

describe("epubRuntime tts targeting helpers", () => {
  it("prefers paragraph blocks over chapter headings or wrapper containers", () => {
    const doc = document.implementation.createHTMLDocument("chapter");
    doc.body.innerHTML = `
      <h1>ONE</h1>
      <div class="page_top_padding">
        <p>The thing was, she was so darn comfortable.</p>
        <p>Another paragraph follows after the first one.</p>
      </div>
    `;

    const match = findTtsBlockElementByText(doc.body, "The thing was, she was so darn comfortable.");

    expect(match?.tagName).toBe("P");
    expect(match?.textContent).toContain("The thing was");
  });

  it("finds the closest paragraph block for a cfi-derived text node", () => {
    const doc = document.implementation.createHTMLDocument("chapter");
    doc.body.innerHTML = `
      <div class="page_top_padding">
        <p><span>The thing was, she was so darn comfortable.</span></p>
      </div>
    `;

    const textNode = doc.querySelector("span")?.firstChild ?? null;
    const match = getNearestTtsBlockElement(textNode);

    expect(match?.tagName).toBe("P");
    expect(match?.textContent).toContain("The thing was");
  });
});
