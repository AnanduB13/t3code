import { describe, expect, it } from "vite-plus/test";

import { hasWideMarkdownBlock } from "./wideMarkdownBlocks";

describe("hasWideMarkdownBlock", () => {
  it("ignores prose, inline code, and emphasis", () => {
    expect(hasWideMarkdownBlock("just a message")).toBe(false);
    expect(hasWideMarkdownBlock("I found it in `secteurs_intervention` earlier")).toBe(false);
    expect(hasWideMarkdownBlock("a | b in a sentence")).toBe(false);
    expect(hasWideMarkdownBlock("an em dash — and a rule\n\n---\n")).toBe(false);
  });

  it("detects fenced code blocks", () => {
    expect(hasWideMarkdownBlock("before\n```\ncode\n```\nafter")).toBe(true);
    expect(hasWideMarkdownBlock("before\n```ts\ncode\n```")).toBe(true);
    expect(hasWideMarkdownBlock("before\n~~~\ncode\n~~~")).toBe(true);
    expect(hasWideMarkdownBlock("   ```\ncode\n```")).toBe(true);
  });

  it("detects top-level and blockquoted ordered-list markers", () => {
    expect(hasWideMarkdownBlock("1. One\n2. Two\n3. Three\n4. Four\n5. Five")).toBe(true);
    expect(hasWideMarkdownBlock("before\n3) Three")).toBe(true);
    expect(hasWideMarkdownBlock("> 1. One\n> 2. Two")).toBe(true);
    expect(hasWideMarkdownBlock("> > 3) Three")).toBe(true);
  });

  it("detects nested ordered lists and indented code", () => {
    expect(hasWideMarkdownBlock("- Parent\n    1. Child\n    2. Child")).toBe(true);
    expect(hasWideMarkdownBlock("> - Parent\n>     1. Child")).toBe(true);
    expect(hasWideMarkdownBlock("    1. indented code")).toBe(true);
    expect(hasWideMarkdownBlock("    - code-like bullet\n    1. indented code")).toBe(true);
  });

  it("detects pasted error traces with indented code and no fences", () => {
    const prompt = [
      "## Error Type",
      "Console TypeError",
      "",
      "## Error Message",
      'can\'t access property "activeChart", this._innerAPI() is undefined',
      "",
      "    at Chart.useEffect (src/app/replay-studio/Chart.tsx:546:37)",
      "    at Home (src/app/page.tsx:1389:19)",
      "",
      "## Code Frame",
      "  544 |     deliveredClock.current = current.time;",
      "  545 |     ranges.current?.refresh();",
      "> 546 |     const chart = instance.current?.activeChart();",
      "      |                                     ^",
      "  547 |     if (current.time < previous) {",
      "  548 |       feed.current?.reset(current.time, false);",
      "  549 |       instance.current?.resetCache();",
      "",
      "Next.js version: 16.3.3 (Turbopack)",
      " getting this error.. fix it",
    ].join("\n");

    expect(hasWideMarkdownBlock(prompt)).toBe(true);
    expect(hasWideMarkdownBlock(prompt, { includeOrderedLists: false })).toBe(true);
  });

  it("detects tab-indented and quoted code blocks", () => {
    expect(hasWideMarkdownBlock("before\n\n\tcode\n\nafter")).toBe(true);
    expect(hasWideMarkdownBlock("before\n\n  \tcode")).toBe(true);
    expect(hasWideMarkdownBlock(">     code")).toBe(true);
    expect(hasWideMarkdownBlock("> > ```ts\n> > code\n> > ```")).toBe(true);
    expect(hasWideMarkdownBlock("> ~~~\n> code\n> ~~~")).toBe(true);
    expect(hasWideMarkdownBlock("before\n    \n\t\nafter")).toBe(false);
    expect(hasWideMarkdownBlock("   ordinary prose")).toBe(false);
  });

  it("can limit ordered-list width pinning to Android", () => {
    const orderedList = "1. One\n2. Two";
    expect(hasWideMarkdownBlock(orderedList, { includeOrderedLists: true })).toBe(true);
    expect(hasWideMarkdownBlock(orderedList, { includeOrderedLists: false })).toBe(false);
    expect(hasWideMarkdownBlock("```\ncode\n```", { includeOrderedLists: false })).toBe(true);
    expect(hasWideMarkdownBlock("| a | b |\n| --- | --- |", { includeOrderedLists: false })).toBe(
      true,
    );
  });

  it("detects GFM tables", () => {
    expect(hasWideMarkdownBlock("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe(true);
    expect(hasWideMarkdownBlock("a | b\n:-- | --:\n1 | 2")).toBe(true);
  });
});
