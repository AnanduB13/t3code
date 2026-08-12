import { describe, expect, it } from "vite-plus/test";

import { parseDelimitedText, serializeDelimitedText } from "./FinderSpreadsheetEditor";

describe("Finder spreadsheet formatting", () => {
  it("parses quoted CSV fields, escaped quotes, and embedded newlines", () => {
    expect(
      parseDelimitedText('name,notes\nAda,"hello, world"\nLinus,"said ""hi""\nagain"', ","),
    ).toEqual([
      ["name", "notes"],
      ["Ada", "hello, world"],
      ["Linus", 'said "hi"\nagain'],
    ]);
  });

  it("round trips TSV cells that require quoting", () => {
    const rows = [
      ["name", "note"],
      ["T3", "line one\nline two"],
      ["tab", "a\tb"],
    ];
    expect(parseDelimitedText(serializeDelimitedText(rows, "\t"), "\t")).toEqual(rows);
  });
});
