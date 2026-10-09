import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const testState = vi.hoisted(() => ({
  file: null as Record<string, unknown> | null,
}));

vi.mock("@pierre/diffs/editor", () => ({
  Editor: class {
    cleanUp() {}
  },
}));

vi.mock("@pierre/diffs/react", () => ({
  EditProvider: ({ children }: { children: React.ReactNode }) => children,
  File: ({ file }: { file: Record<string, unknown> }) => {
    testState.file = file;
    return null;
  },
  Virtualizer: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("~/hooks/useTheme", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

import { FinderCodeEditor } from "./FinderCodeEditor";

describe("FinderCodeEditor", () => {
  beforeEach(() => {
    testState.file = null;
  });

  it("gives persisted editor state a stable file cache key", () => {
    renderToStaticMarkup(
      <FinderCodeEditor
        cacheKey="finder:local:/repo/AGENTS.md"
        contents="# Instructions"
        fileName="AGENTS.md"
        readOnly={false}
        onChange={vi.fn()}
      />,
    );

    expect(testState.file).toEqual({
      name: "AGENTS.md",
      contents: "# Instructions",
      cacheKey: "finder:local:/repo/AGENTS.md",
    });
  });
});
