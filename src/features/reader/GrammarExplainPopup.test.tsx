import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GrammarExplainPopup } from "./GrammarExplainPopup";

describe("GrammarExplainPopup", () => {
  it("shows only the loading state before the grammar result arrives", () => {
    render(<GrammarExplainPopup isLoading />);

    expect(screen.getByRole("dialog", { name: /grammar explanation/i })).toBeInTheDocument();
    expect(screen.queryByText("选中文本")).not.toBeInTheDocument();
    expect(screen.queryByText("Despite himself, Ender's voice trembled.")).not.toBeInTheDocument();
    expect(screen.getByText("正在解析语法...")).toBeInTheDocument();
  });

  it("invokes the close handler when the user clicks the explicit close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<GrammarExplainPopup explanation="这里是语法解析。" onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: /close grammar explanation/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("formats markdown headings, bullets, and inline code into readable sections", () => {
    render(
      <GrammarExplainPopup
        explanation={
          "<answer>\n## 先看整句\n这句话是在问接下来该怎么办。\n\n## 再拆结构\n* 主干是 `asked a boy`。\n* `who had a top bunk near Ender’s` 是补充说明。\n\n## 读起来要注意\n* `be supposed to` 表示“应该”。\n</answer>"
        }
      />,
    );

    expect(screen.getByRole("heading", { name: "先看整句" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "再拆结构" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "读起来要注意" })).toBeInTheDocument();
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(screen.getByText("asked a boy").tagName).toBe("CODE");
    expect(screen.getByText("be supposed to").tagName).toBe("CODE");
  });

  it("repairs malformed inline code when the model closes a backtick span with an apostrophe-like quote", () => {
    render(
      <GrammarExplainPopup
        explanation={
          "<answer>\n## 再拆结构\n* 这里的 `teachers’ quarters' 指的是老师宿舍。\n* `don't come crying to me’ 是很不耐烦的警告。\n</answer>"
        }
      />,
    );

    expect(screen.getByText("teachers’ quarters").tagName).toBe("CODE");
    expect(screen.getByText("don't come crying to me").tagName).toBe("CODE");
  });

  it("repairs malformed inline code when the model leaves a single opening backtick before punctuation", () => {
    render(
      <GrammarExplainPopup
        explanation={"<answer>\n## 读起来要注意\n* 这里强调 `Battle School，不是在说普通学校。\n</answer>"}
      />,
    );

    expect(screen.getByText("Battle School").tagName).toBe("CODE");
    expect(screen.queryByText("`Battle School")).not.toBeInTheDocument();
  });

  it("shows the selected source text in a dedicated quote card above the explanation", () => {
    render(
      <GrammarExplainPopup
        explanation="## 先看整句\n这里是语法解析。"
        selectedText="What are we supposed to do, then?"
      />,
    );

    expect(screen.getByText("原句")).toBeInTheDocument();
    expect(screen.getByText("What are we supposed to do, then?")).toBeInTheDocument();
  });

  it("uses the same font scale variable as the spoken sentence translation note", () => {
    render(<GrammarExplainPopup explanation="这里是语法解析。" fontScale={1.35} />);

    expect(screen.getByRole("dialog", { name: /grammar explanation/i })).toHaveStyle({
      "--reader-tts-sentence-note-text-scale": "1.35",
    });
  });

  it("does not turn ordinary apostrophes into code when there is no opening backtick", () => {
    render(
      <GrammarExplainPopup
        explanation={"<answer>\n## 读起来要注意\n* `don't like Launchies butting in` 是完整短语，但 that's 里的撇号只是正常拼写。\n</answer>"}
      />,
    );

    expect(screen.getByText("don't like Launchies butting in").tagName).toBe("CODE");
    expect(screen.queryByText("that's")?.tagName).not.toBe("CODE");
  });
});
