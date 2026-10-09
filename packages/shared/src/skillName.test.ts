import { describe, expect, it } from "vite-plus/test";

import { normalizeSkillName } from "./skillName.ts";

describe("normalizeSkillName", () => {
  it("normalizes a title into a valid skill directory name", () => {
    expect(normalizeSkillName("  Review TypeScript & Tests  ")).toBe("review-typescript-tests");
  });

  it("removes trailing separators after enforcing the length limit", () => {
    expect(normalizeSkillName(`${"a".repeat(63)} -- extra`)).toBe("a".repeat(63));
  });
});
