import type { Page } from "@playwright/test";

export async function selectTextInIframe(page: Page, chapterButtonName?: string) {
  if (chapterButtonName) {
    await page.getByRole("button", { name: chapterButtonName }).click();
  }

  await page.waitForFunction(() => {
    const frame = document.querySelector<HTMLIFrameElement>(".epub-root iframe");
    const doc = frame?.contentDocument;
    const paragraph = doc?.querySelector("p");
    const text = paragraph?.textContent?.trim() ?? "";

    return text.length > 12;
  });

  return await page.locator(".epub-root iframe").evaluateAll((frames) => {
    for (const frame of frames) {
      const doc = frame.contentDocument;
      const paragraph = doc?.querySelector("p");
      const textNode = paragraph?.firstChild;

      if (doc && paragraph && textNode && textNode.textContent && textNode.textContent.length > 12) {
        const range = doc.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, Math.min(18, textNode.textContent.length));
        const selection = frame.contentWindow?.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        doc.dispatchEvent(new Event("selectionchange"));
        return textNode.textContent.slice(0, Math.min(18, textNode.textContent.length));
      }
    }

    return "";
  });
}
