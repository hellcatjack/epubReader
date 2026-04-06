type GrammarExplainPopupProps = {
  error?: string;
  explanation?: string;
  fontScale?: number;
  isLoading?: boolean;
  onClose?: () => void;
  selectedText?: string;
};

type GrammarExplainBlock =
  | { level: 2 | 3; text: string; type: "heading" }
  | { ordered?: boolean; items: string[]; type: "list" }
  | { text: string; type: "paragraph" };

const INLINE_CODE_MAX_LENGTH = 120;
const INLINE_CODE_FALLBACK_CLOSERS = new Set(["'", "’", "‘"]);
const INLINE_CODE_STOP_CHARS = new Set(["\n", ".", ",", "!", "?", ":", ";", "。", "，", "！", "？", "：", "；"]);

function normalizeInlineSpacing(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function isCjkCharacter(char: string | undefined) {
  return char != null && /[\u3400-\u9fff]/u.test(char);
}

function isInlineCodeBoundary(char: string | undefined) {
  return char == null || /\s|[)\]}>」』】》）,.!?;:，。！？；：]/u.test(char);
}

function looksLikeInlineCode(text: string) {
  const normalized = text.trim();
  if (!normalized || normalized.length > INLINE_CODE_MAX_LENGTH) {
    return false;
  }

  if (!/[A-Za-z]/.test(normalized)) {
    return false;
  }

  if (/[`]/.test(normalized) || /[\u4e00-\u9fff]/u.test(normalized)) {
    return false;
  }

  return /^[A-Za-z0-9\s"'‘’.,!?;:()[\]{}\-_/&]+$/u.test(normalized);
}

function findMalformedInlineCode(text: string, codeStart: number) {
  const searchLimit = Math.min(text.length, codeStart + INLINE_CODE_MAX_LENGTH + 1);
  let quoteCloserIndex = -1;
  let boundaryIndex = -1;

  for (let index = codeStart + 1; index < searchLimit; index += 1) {
    const char = text[index];
    if (char === "`") {
      return null;
    }

    if (INLINE_CODE_FALLBACK_CLOSERS.has(char) && isInlineCodeBoundary(text[index + 1])) {
      quoteCloserIndex = index;
      continue;
    }

    if (isCjkCharacter(char) || INLINE_CODE_STOP_CHARS.has(char)) {
      boundaryIndex = index;
      break;
    }
  }

  if (quoteCloserIndex !== -1) {
    const candidate = text.slice(codeStart + 1, quoteCloserIndex);
    if (looksLikeInlineCode(candidate)) {
      return {
        codeText: candidate.trim(),
        nextCursor: quoteCloserIndex + 1,
      };
    }
  }

  if (boundaryIndex !== -1) {
    const candidate = text.slice(codeStart + 1, boundaryIndex);
    if (looksLikeInlineCode(candidate)) {
      return {
        codeText: candidate.trim(),
        nextCursor: boundaryIndex,
      };
    }
  }

  if (searchLimit === text.length) {
    const candidate = text.slice(codeStart + 1);
    if (looksLikeInlineCode(candidate)) {
      return {
        codeText: candidate.trim(),
        nextCursor: text.length,
      };
    }
  }

  return null;
}

function formatGrammarExplanation(explanation: string): GrammarExplainBlock[] {
  const source = explanation
    .trim()
    .replace(/<answer>/gi, "")
    .replace(/<\/answer>/gi, "")
    .trim();
  if (!source) {
    return [];
  }

  const blocks: GrammarExplainBlock[] = [];
  const lines = source.split(/\r?\n/);
  let paragraphLines: string[] = [];
  let currentList: string[] | null = null;
  let currentListOrdered = false;

  const flushParagraph = () => {
    const nextText = normalizeInlineSpacing(paragraphLines.join(" "));
    if (nextText) {
      blocks.push({ text: nextText, type: "paragraph" });
    }
    paragraphLines = [];
  };

  const flushList = () => {
    if (currentList?.length) {
      blocks.push({ items: currentList, ordered: currentListOrdered, type: "list" });
    }
    currentList = null;
    currentListOrdered = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        level: headingMatch[1] === "###" ? 3 : 2,
        text: normalizeInlineSpacing(headingMatch[2]),
        type: "heading",
      });
      continue;
    }

    const legacyHeadingMatch = line.match(/^\*\*(.+)\*\*$/);
    if (legacyHeadingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        level: 2,
        text: normalizeInlineSpacing(legacyHeadingMatch[1]),
        type: "heading",
      });
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (!currentList) {
        currentList = [];
        currentListOrdered = false;
      }
      currentList.push(normalizeInlineSpacing(unorderedMatch[1]));
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (!currentList) {
        currentList = [];
        currentListOrdered = true;
      }
      currentList.push(normalizeInlineSpacing(orderedMatch[1]));
      continue;
    }

    if (currentList) {
      flushList();
    }
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function renderInlineMarkdown(text: string, keyPrefix: string) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let segmentIndex = 0;

  while (cursor < text.length) {
    const boldStart = text.indexOf("**", cursor);
    const codeStart = text.indexOf("`", cursor);
    const nextTokenStart =
      boldStart === -1 ? codeStart : codeStart === -1 ? boldStart : Math.min(boldStart, codeStart);

    if (nextTokenStart === -1) {
      nodes.push(text.slice(cursor));
      return nodes;
    }

    if (nextTokenStart > cursor) {
      nodes.push(text.slice(cursor, nextTokenStart));
    }

    if (nextTokenStart === boldStart) {
      const end = text.indexOf("**", boldStart + 2);
      if (end === -1) {
        nodes.push(text.slice(boldStart));
        return nodes;
      }

      const strongText = text.slice(boldStart + 2, end).trim();
      if (strongText) {
        nodes.push(<strong key={`${keyPrefix}-strong-${segmentIndex}`}>{strongText}</strong>);
        segmentIndex += 1;
      }
      cursor = end + 2;
      continue;
    }

    const end = text.indexOf("`", codeStart + 1);
    if (end === -1) {
      const repairedCode = findMalformedInlineCode(text, codeStart);
      if (!repairedCode) {
        nodes.push(text.slice(codeStart));
        return nodes;
      }

      nodes.push(<code key={`${keyPrefix}-code-${segmentIndex}`}>{repairedCode.codeText}</code>);
      segmentIndex += 1;
      cursor = repairedCode.nextCursor;
      continue;
    }

    const codeText = text.slice(codeStart + 1, end).trim();
    if (codeText) {
      nodes.push(<code key={`${keyPrefix}-code-${segmentIndex}`}>{codeText}</code>);
      segmentIndex += 1;
    }
    cursor = end + 1;
  }

  return nodes;
}

export function GrammarExplainPopup({
  error,
  explanation,
  fontScale = 1,
  isLoading = false,
  onClose,
  selectedText,
}: GrammarExplainPopupProps) {
  const blocks = explanation ? formatGrammarExplanation(explanation) : [];

  return (
    <aside
      aria-label="Grammar explanation"
      className="reader-grammar-popup"
      role="dialog"
      style={
        {
          "--reader-tts-sentence-note-text-scale": String(fontScale),
        } as React.CSSProperties
      }
    >
      <div className="reader-grammar-popup-header">
        <div>
          <p className="reader-grammar-popup-eyebrow">语法解析</p>
          <h2 className="reader-grammar-popup-title">Explain</h2>
        </div>
        <button
          aria-label="Close grammar explanation"
          className="reader-grammar-popup-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      <section className="reader-grammar-popup-section">
        <p className="reader-grammar-popup-label">中文语法解析</p>
        {selectedText ? (
          <div className="reader-grammar-popup-selection-wrap">
            <p className="reader-grammar-popup-selection-label">原句</p>
            <blockquote className="reader-grammar-popup-selection">{selectedText}</blockquote>
          </div>
        ) : null}
        {isLoading ? (
          <p className="reader-grammar-popup-placeholder">正在解析语法...</p>
        ) : error ? (
          <p className="reader-grammar-popup-error">{error}</p>
        ) : (
          <div className="reader-grammar-popup-body">
            {blocks.length > 0 ? (
              blocks.map((block, blockIndex) => {
                if (block.type === "heading") {
                  const HeadingTag = block.level === 3 ? "h4" : "h3";
                  return (
                    <HeadingTag className="reader-grammar-popup-block-heading" key={`heading-${blockIndex}`}>
                      {renderInlineMarkdown(block.text, `heading-${blockIndex}`)}
                    </HeadingTag>
                  );
                }

                if (block.type === "list") {
                  const ListTag = block.ordered ? "ol" : "ul";
                  return (
                    <ListTag className="reader-grammar-popup-list" key={`list-${blockIndex}`}>
                      {block.items.map((item, itemIndex) => (
                        <li className="reader-grammar-popup-list-item" key={`item-${blockIndex}-${itemIndex}`}>
                          {renderInlineMarkdown(item, `item-${blockIndex}-${itemIndex}`)}
                        </li>
                      ))}
                    </ListTag>
                  );
                }

                return (
                  <p className="reader-grammar-popup-paragraph" key={`paragraph-${blockIndex}`}>
                    {renderInlineMarkdown(block.text, `paragraph-${blockIndex}`)}
                  </p>
                );
              })
            ) : (
              <p className="reader-grammar-popup-paragraph">{explanation}</p>
            )}
          </div>
        )}
      </section>
    </aside>
  );
}
