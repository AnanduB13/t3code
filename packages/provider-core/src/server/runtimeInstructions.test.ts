import { assert, describe, expect, it } from "@effect/vitest";

import { buildRuntimeInstructions } from "./runtimeInstructions.ts";

describe("buildRuntimeInstructions", () => {
  it("links PRs the agent creates, takes over, or pushes to, and no others", () => {
    const instructions = buildRuntimeInstructions({ harness: "Codex" });

    assert.include(instructions, "Link each PR you create, take over, or push to");
    assert.include(instructions, "one link_pull_request per PR");
    assert.include(instructions, "Skip PRs you only read or review");
    assert.include(instructions, "If linking fails, say so.");
    assert.notInclude(instructions, "git log -1");
    assert.notInclude(instructions, "work on");
    // Listing linked PRs as an end-of-work check found nothing to add in audited threads.
    assert.notInclude(instructions, "list_thread_pull_requests");
  });

  it("waits on a PR only with the watch, never with a poll loop", () => {
    const instructions = buildRuntimeInstructions({ harness: "Codex" });

    assert.notInclude(instructions, "Creation, pending checks, or a merge ask alone is not enough");
    assert.include(instructions, "Links and watches persist across pushes.");
    // The wake message itself carries the do-not-re-watch rule.
    assert.notInclude(instructions, "On a wake");
    assert.include(
      instructions,
      "Call watch_pull_request when asked to monitor or babysit, or when work you were asked to do, such as a merge, still waits on checks or reviews, even after an earlier unwatch",
    );
    assert.notInclude(instructions, "merge it now");
    assert.include(instructions, "Otherwise act now or hand back.");
    assert.include(instructions, "then watch and end your turn");
    assert.include(instructions, "never watch, even if the brief says babysit");
    assert.include(
      instructions,
      "After PR work, a child's last line is: PR <full URL>, head <SHA>, checks and reviews <state>.",
    );
    assert.include(instructions, "Never wait with sleep");
    assert.include(instructions, "call unwatch_pull_request");
  });
});

describe("After Dark shared research instructions", () => {
  it.each(["Codex", "Claude Code", "Cursor", "Grok", "OpenCode", "Antigravity"])(
    "identifies the %s harness and describes media embedding",
    (harness) => {
      const instructions = buildRuntimeInstructions({ harness });
      expect(instructions).toContain(`running in T3 Code through the ${harness} harness.`);
      expect(instructions).toContain("embed images, video, and audio");
      expect(instructions).toContain("Markdown image syntax with absolute file paths");
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
});
