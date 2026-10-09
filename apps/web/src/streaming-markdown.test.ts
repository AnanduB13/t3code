import { describe, expect, it } from "vite-plus/test";

import { commonStreamingPrefixLength, rehypeStreamingWords } from "./streaming-markdown";

type TestNode = {
  type: string;
  tagName?: string;
  value?: string;
  position?: { start: { offset: number }; end: { offset: number } };
  properties?: Record<string, unknown>;
  children?: TestNode[];
};

describe("streaming Markdown words", () => {
  it("animates only words inside the newly appended source range", () => {
    const tree: TestNode = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "p",
          children: [
            {
              type: "text",
              value: "Already sharp. New words arrive.",
              position: { start: { offset: 0 }, end: { offset: 32 } },
            },
          ],
        },
      ],
    };

    rehypeStreamingWords({ ranges: [{ start: 15, end: 32 }] })(tree);

    const words = tree.children?.[0]?.children ?? [];
    expect(words.map((word) => word.children?.[0]?.value ?? word.value)).toEqual([
      "Already sharp. ",
      "New ",
      "words ",
      "arrive.",
    ]);
    expect(words.map((word) => word.properties?.className)).toEqual([
      undefined,
      ["streaming-word-in"],
      ["streaming-word-in"],
      ["streaming-word-in"],
    ]);
    expect(words[1]?.properties?.style).toBe("--stream-word-delay:0ms");
    expect(words[2]?.properties?.style).toBe("--stream-word-delay:55ms");
  });

  it("does not split code content", () => {
    const tree: TestNode = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "pre",
          children: [
            {
              type: "element",
              tagName: "code",
              children: [
                {
                  type: "text",
                  value: "const answer = 42;",
                  position: { start: { offset: 0 }, end: { offset: 18 } },
                },
              ],
            },
          ],
        },
      ],
    };

    rehypeStreamingWords({ ranges: [{ start: 0, end: 18 }] })(tree);

    expect(tree.children?.[0]?.children?.[0]?.children).toEqual([
      {
        type: "text",
        value: "const answer = 42;",
        position: { start: { offset: 0 }, end: { offset: 18 } },
      },
    ]);
  });

  it("finds the stable prefix when a provider revises streamed text", () => {
    expect(commonStreamingPrefixLength("Alpha beta", "Alpha better")).toBe(9);
    expect(commonStreamingPrefixLength("Alpha", "Alpha beta")).toBe(5);
  });
});
