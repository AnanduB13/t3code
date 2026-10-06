import { ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveRenameCommit, shouldShowProjectHeaderActions } from "./ChatHeader";
import { GENERAL_CHATS_PROJECT_ID } from "../../generalChats";

describe("shouldShowProjectHeaderActions", () => {
  it("hides project controls for standalone chats", () => {
    expect(shouldShowProjectHeaderActions(GENERAL_CHATS_PROJECT_ID)).toBe(false);
  });

  it("shows project controls for regular projects", () => {
    expect(shouldShowProjectHeaderActions(ProjectId.make("project-1"))).toBe(true);
  });
});

describe("resolveRenameCommit", () => {
  it("commits a trimmed changed title", () => {
    expect(resolveRenameCommit({ title: "  New title ", originalTitle: "Old" })).toEqual({
      action: "commit",
      title: "New title",
    });
  });

  it("rejects empty and whitespace-only titles", () => {
    expect(resolveRenameCommit({ title: "   ", originalTitle: "Old" })).toEqual({
      action: "reject-empty",
    });
  });

  it("no-ops when the trimmed title is unchanged", () => {
    expect(resolveRenameCommit({ title: " Old ", originalTitle: "Old" })).toEqual({
      action: "noop",
    });
  });
});
