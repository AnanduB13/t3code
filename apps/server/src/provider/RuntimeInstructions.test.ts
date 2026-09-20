import { describe, expect, it } from "vite-plus/test";
import { buildRuntimeInstructions } from "./RuntimeInstructions.ts";

describe("buildRuntimeInstructions", () => {
  it.each(["Codex", "Claude Code", "Cursor", "Grok", "OpenCode", "Antigravity"])(
    "identifies the %s harness and describes media embedding",
    (harness) => {
      const instructions = buildRuntimeInstructions({ harness });
      expect(instructions).toContain(`running in T3 Code through the ${harness} harness.`);
      expect(instructions).toContain("embed images and videos");
      expect(instructions).toContain("Markdown with absolute file paths");
      expect(instructions).not.toContain("undefined");
    },
  );

  it.each(["Claude Code", "Cursor", "Grok", "OpenCode", "Antigravity"])(
    "gives %s a research workflow only when browser tools are attached",
    (harness) => {
      const enabled = buildRuntimeInstructions({ harness, browserToolsAvailable: true });
      expect(enabled).toContain("preview_status");
      expect(enabled).toContain("preview_open");
      expect(enabled).toContain("inspect their destination pages");
      expect(enabled).toContain("shopping comparisons (including Amazon)");
      for (const browserToolsAvailable of [false, undefined]) {
        const disabled = buildRuntimeInstructions({ harness, browserToolsAvailable });
        expect(disabled).not.toContain("preview_");
        expect(disabled).not.toContain("Do not switch to global browser skills");
        expect(disabled).toContain("A search URL alone does not complete");
        expect(disabled).toContain("If no research tools are available, say so");
      }
    },
  );

  it("keeps known model and effort metadata on one line", () => {
    expect(
      buildRuntimeInstructions({
        harness: "Codex",
        model: "  custom\nmodel  ",
        reasoningEffort: " high\n",
      }),
    ).toContain("through the Codex harness, as custom model with high reasoning effort.");
  });

  it.each([undefined, "", "auto", "default"])("omits unresolved model %s", (model) => {
    const instructions = buildRuntimeInstructions({ harness: "Cursor", model });
    expect(instructions).toContain("through the Cursor harness.");
    expect(instructions).not.toContain("reasoning effort");
  });
});
