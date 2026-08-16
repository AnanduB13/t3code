const STREAM_WORD_MS = 55;
const MAX_STREAM_WORD_DELAY_MS = 330;

type SourcePosition = {
  readonly start?: { readonly offset?: number };
  readonly end?: { readonly offset?: number };
};

type HastNode = {
  type?: string;
  tagName?: string;
  value?: string;
  position?: SourcePosition;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

export type StreamingTextRange = {
  readonly start: number;
  readonly end: number;
};

const STREAMING_ANIMATION_EXCLUDED_TAGS = new Set(["code", "pre", "script", "style"]);
const WORD_SEGMENT_PATTERN = /\S+\s*|\s+/g;

function rangeContainingOffset(ranges: ReadonlyArray<StreamingTextRange>, offset: number) {
  return ranges.findIndex((range) => offset >= range.start && offset < range.end);
}

function splitStreamingTextNode(
  node: HastNode,
  ranges: ReadonlyArray<StreamingTextRange>,
  wordCountsByRange: number[],
): HastNode[] {
  const value = node.value ?? "";
  const sourceStart = node.position?.start?.offset;
  if (value.length === 0 || sourceStart === undefined) {
    return [node];
  }

  const result: HastNode[] = [];
  const appendText = (text: string) => {
    const previous = result.at(-1);
    if (previous?.type === "text") {
      previous.value = `${previous.value ?? ""}${text}`;
      return;
    }
    result.push({ type: "text", value: text });
  };

  for (const match of value.matchAll(WORD_SEGMENT_PATTERN)) {
    const segment = match[0];
    const segmentOffset = sourceStart + (match.index ?? 0);
    if (segment.trim().length === 0) {
      appendText(segment);
      continue;
    }

    const rangeIndex = rangeContainingOffset(ranges, segmentOffset);
    const shouldAnimate = rangeIndex >= 0;
    if (!shouldAnimate) {
      appendText(segment);
      continue;
    }

    const wordIndex = wordCountsByRange[rangeIndex] ?? 0;
    wordCountsByRange[rangeIndex] = wordIndex + 1;
    result.push({
      type: "element",
      tagName: "span",
      properties: {
        className: ["streaming-word-in"],
        style: `--stream-word-delay:${Math.min(wordIndex * STREAM_WORD_MS, MAX_STREAM_WORD_DELAY_MS)}ms`,
      },
      children: [{ type: "text", value: segment }],
    });
  }

  return result;
}

/**
 * Wrap Markdown prose in stable word spans and mark only newly streamed source
 * ranges for animation. Code remains byte-for-byte selectable and is never
 * split, which also keeps syntax highlighting incremental and inexpensive.
 */
export function rehypeStreamingWords(options: {
  readonly ranges: ReadonlyArray<StreamingTextRange>;
}) {
  return (tree: HastNode) => {
    const wordCountsByRange = options.ranges.map(() => 0);

    const visit = (node: HastNode, excluded: boolean) => {
      const nextExcluded =
        excluded ||
        (node.type === "element" &&
          node.tagName !== undefined &&
          STREAMING_ANIMATION_EXCLUDED_TAGS.has(node.tagName));
      if (!node.children || nextExcluded) {
        return;
      }

      node.children = node.children.flatMap((child) => {
        if (child.type === "text") {
          return splitStreamingTextNode(child, options.ranges, wordCountsByRange);
        }
        visit(child, nextExcluded);
        return [child];
      });
    };

    visit(tree, false);
  };
}

export function commonStreamingPrefixLength(previous: string, current: string): number {
  const limit = Math.min(previous.length, current.length);
  let index = 0;
  while (index < limit && previous[index] === current[index]) {
    index += 1;
  }
  return index;
}
