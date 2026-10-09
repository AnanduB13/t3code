import { describe, expect, it } from "vite-plus/test";

import { resolveFinderEditorContents } from "./finderEditorContents";

const loadedFile = {
  relativePath: "skills/babysit-pr/SKILL.md",
  contents: "line one\nline two\n",
  byteLength: 18,
  truncated: false,
};

describe("resolveFinderEditorContents", () => {
  it("waits for the requested file instead of mounting an empty editor", () => {
    expect(
      resolveFinderEditorContents({
        requestedPath: loadedFile.relativePath,
        file: null,
        localContents: "",
        dirty: false,
      }),
    ).toEqual({ ready: false });

    expect(
      resolveFinderEditorContents({
        requestedPath: loadedFile.relativePath,
        file: { ...loadedFile, relativePath: "AGENTS.md" },
        localContents: "",
        dirty: false,
      }),
    ).toEqual({ ready: false });
  });

  it("seeds a clean editor from the loaded response", () => {
    expect(
      resolveFinderEditorContents({
        requestedPath: loadedFile.relativePath,
        file: loadedFile,
        localContents: "",
        dirty: false,
      }),
    ).toEqual({ ready: true, contents: loadedFile.contents });
  });

  it("keeps local edits after the file has loaded", () => {
    expect(
      resolveFinderEditorContents({
        requestedPath: loadedFile.relativePath,
        file: loadedFile,
        localContents: "edited",
        dirty: true,
      }),
    ).toEqual({ ready: true, contents: "edited" });
  });
});
