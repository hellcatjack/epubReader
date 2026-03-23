import { describe, expect, it, vi } from "vitest";
import {
  buildTocItems,
  extractSentenceContextFromRange,
  findTtsSegmentTextRange,
  findTtsBlockElementByText,
  getPagePresentationKind,
  getNearestTtsBlockElement,
  readPaginatedPageIndex,
  restorePaginatedPageOffset,
  restorePaginatedPagePosition,
  shouldAutoScrollTtsSegment,
  waitForLayoutFrame,
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

  it("locates the precise text range for the currently spoken tts segment inside a paragraph", () => {
    const doc = document.implementation.createHTMLDocument("chapter");
    doc.body.innerHTML = `
      <p>The first sentence in this fixture keeps running across the page with enough detail to force the reader into multiple TTS chunks while still remaining a single sentence so the highlight should stay locked to only the currently spoken portion instead of washing over the full paragraph as if the entire block were already being read aloud from beginning to end without any finer-grained tracking at all before the voice has actually reached the later clauses near the far side of the page and before the reader has any reason to believe that the later descriptive tail has begun to speak.</p>
    `;

    const paragraph = doc.querySelector("p");
    if (!paragraph) {
      throw new Error("missing paragraph");
    }

    const segment =
      "The first sentence in this fixture keeps running across the page with enough detail to force the reader into multiple TTS chunks while still remaining a single sentence so the highlight should stay locked to only the currently spoken portion instead of washing over the full paragraph as if the entire block were already being read aloud from beginning to end without any finer-grained tracking at all before the voice has actually reached the later clauses near the far side of the page and before";
    const range = findTtsSegmentTextRange(paragraph, segment);

    expect(range).not.toBeNull();
    expect(range?.toString().replace(/\s+/g, " ").trim()).toBe(segment);
  });

  it("uses source offsets to target a repeated word occurrence instead of the first text match", () => {
    const doc = document.implementation.createHTMLDocument("chapter");
    doc.body.innerHTML = `
      <p>Alpha beta alpha gamma</p>
    `;

    const paragraph = doc.querySelector("p");
    if (!paragraph) {
      throw new Error("missing paragraph");
    }

    const secondAlphaStart = "Alpha beta ".length;
    const range = findTtsSegmentTextRange(paragraph, "alpha", secondAlphaStart, secondAlphaStart + "alpha".length);
    if (!range) {
      throw new Error("missing range");
    }

    const prefix = doc.createRange();
    prefix.selectNodeContents(paragraph);
    prefix.setEnd(range.startContainer, range.startOffset);

    expect(range.toString()).toBe("alpha");
    expect(prefix.toString().replace(/\s+/g, " ").trim()).toBe("Alpha beta");
  });

  it("extracts the full sentence context for a single-word selection", () => {
    const doc = document.implementation.createHTMLDocument("chapter");
    doc.body.innerHTML = `
      <p>She looked <span>pressed</span> for time before the meeting. Another sentence follows after it.</p>
    `;

    const textNode = doc.querySelector("span")?.firstChild;
    if (!textNode) {
      throw new Error("missing text node");
    }

    const range = doc.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, "pressed".length);

    expect(extractSentenceContextFromRange(range)).toBe("She looked pressed for time before the meeting.");
  });

  it("extracts the containing sentence for a phrase selection inside a paragraph", () => {
    const doc = document.implementation.createHTMLDocument("chapter");
    doc.body.innerHTML = `
      <p>He looked up at him before leaving the room. Then he waved from the doorway.</p>
    `;

    const textNode = doc.querySelector("p")?.firstChild;
    if (!textNode) {
      throw new Error("missing paragraph text");
    }

    const text = textNode.textContent ?? "";
    const start = text.indexOf("looked up at him");
    const range = doc.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + "looked up at him".length);

    expect(extractSentenceContextFromRange(range)).toBe("He looked up at him before leaving the room.");
  });

  it("stops at the selected sentence terminator when the selection already ends at a period", () => {
    const doc = document.implementation.createHTMLDocument("chapter");
    doc.body.innerHTML = `
      <p>To her left was Eli’s bedroom. She could see Eli’s body piled under the Star Wars blanket his foster parents had bought for him before he was born.</p>
    `;

    const textNode = doc.querySelector("p")?.firstChild;
    if (!textNode) {
      throw new Error("missing paragraph text");
    }

    const text = textNode.textContent ?? "";
    const selectedSentence = "To her left was Eli’s bedroom.";
    const start = text.indexOf(selectedSentence);
    const range = doc.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + selectedSentence.length);

    expect(extractSentenceContextFromRange(range)).toBe("To her left was Eli’s bedroom.");
  });

  it("preserves nested epub navigation items instead of flattening them", () => {
    const toc = buildTocItems([
      {
        href: "genesis.xhtml#book",
        id: "genesis",
        label: "Genesis",
        subitems: [
          {
            href: "genesis.xhtml#c1",
            id: "genesis-1",
            label: "Chapter 1",
            subitems: [],
          },
        ],
      },
    ] as never);

    expect(toc).toEqual([
      {
        children: [
          {
            children: [],
            id: "genesis-1",
            label: "Chapter 1",
            target: "genesis.xhtml#c1",
          },
        ],
        id: "genesis",
        label: "Genesis",
        target: "genesis.xhtml#book",
      },
    ]);
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

  it("falls back to timers for layout waits when the page is hidden", async () => {
    vi.useFakeTimers();
    const requestAnimationFrameSpy = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrameSpy);

    const hiddenDocument = document.implementation.createHTMLDocument("hidden");
    Object.defineProperty(hiddenDocument, "hidden", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(hiddenDocument, "visibilityState", {
      configurable: true,
      value: "hidden",
    });

    let resolved = false;
    void waitForLayoutFrame(hiddenDocument).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
    expect(resolved).toBe(true);

    vi.useRealTimers();
  });

  it("classifies image-dominant map pages as image presentation", () => {
    const doc = document.implementation.createHTMLDocument("map");
    doc.body.innerHTML = `
      <div class="figure_nomargin figure_fullpage">
        <div class="squeeze squeeze100">
          <img alt="" class="image" src="map-left.jpg" />
        </div>
      </div>
      <figure class="figure figure_fullpage_caption">
        <div class="squeeze squeeze90">
          <img alt="" class="image" src="map-right.jpg" />
        </div>
        <figcaption class="figcaption dynamic_box">
          <p class="figcaption_para">Detail right</p>
        </figcaption>
      </figure>
    `;

    expect(getPagePresentationKind(doc)).toBe("image");
  });

  it("keeps chapter prose pages in prose presentation mode", () => {
    const doc = document.implementation.createHTMLDocument("chapter");
    doc.body.innerHTML = `
      <h1>ONE</h1>
      <p>Morgan’s head was pressed against her pillow. The alarm on her phone had just been snoozed again, and her plan to leave early for school was slipping away with every minute she stayed put.</p>
      <p>Escaping was the plan this morning, just not into another world. Rather, Morgan intended to get out of the house and on her way to school solo.</p>
    `;

    expect(getPagePresentationKind(doc)).toBe("prose");
  });
});
