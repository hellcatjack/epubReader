import { describe, expect, it } from "vitest";
import {
  findTtsBlockElementByText,
  getNearestTtsBlockElement,
  readPaginatedPageIndex,
  restorePaginatedPageOffset,
  restorePaginatedPagePosition,
  shouldAutoScrollTtsSegment,
} from "./epubRuntime";

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

  it("never auto-scrolls active tts markers inside paginated renditions", () => {
    expect(
      shouldAutoScrollTtsSegment("paginated", {
        bottom: 980,
        top: 40,
      } as DOMRect, 900),
    ).toBe(false);
  });

  it("auto-scrolls active tts markers in scrolled mode when they leave the viewport band", () => {
    expect(
      shouldAutoScrollTtsSegment("scrolled", {
        bottom: 980,
        top: 40,
      } as DOMRect, 900),
    ).toBe(true);
  });

  it("restores the saved paginated page offset on the epub container", () => {
    const container = document.createElement("div");
    container.scrollLeft = 0;

    restorePaginatedPageOffset("paginated", container, 1412);

    expect(container.scrollLeft).toBe(1412);
  });

  it("derives a stable paginated page index from the current container width", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 1826,
    });
    container.scrollLeft = 3652;

    expect(readPaginatedPageIndex("paginated", container)).toBe(2);
  });

  it("restores paginated position from a saved page index instead of stale pixel offsets", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 1826,
    });
    container.scrollLeft = 0;

    restorePaginatedPagePosition("paginated", container, 1412, 2);

    expect(container.scrollLeft).toBe(3652);
  });
});
