import { ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  excludeGeneralChatsProject,
  excludeGeneralChatsThreads,
  GENERAL_CHATS_PROJECT_ID,
  isGeneralChatsProjectAlreadyExistsError,
  isGeneralChatsProject,
  isGeneralChatsProjectId,
} from "./generalChats.ts";

describe("general chats identity", () => {
  it("recognizes and excludes the reserved project across clients", () => {
    const regularProjectId = ProjectId.make("project-1");
    const projects = [{ id: GENERAL_CHATS_PROJECT_ID }, { id: regularProjectId }];
    const threads = [
      { id: ThreadId.make("chat-1"), projectId: GENERAL_CHATS_PROJECT_ID },
      { id: ThreadId.make("thread-1"), projectId: regularProjectId },
    ];

    expect(isGeneralChatsProjectId(GENERAL_CHATS_PROJECT_ID)).toBe(true);
    expect(isGeneralChatsProject(projects[0]!)).toBe(true);
    expect(excludeGeneralChatsProject(projects)).toEqual([{ id: regularProjectId }]);
    expect(excludeGeneralChatsThreads(threads)).toEqual([
      { id: ThreadId.make("thread-1"), projectId: regularProjectId },
    ]);
  });

  it("recognizes only the duplicate general chats project invariant", () => {
    expect(
      isGeneralChatsProjectAlreadyExistsError({
        _tag: "OrchestrationCommandInvariantError",
        commandType: "project.create",
        detail: `Project '${GENERAL_CHATS_PROJECT_ID}' already exists and cannot be created twice.`,
      }),
    ).toBe(true);
    expect(isGeneralChatsProjectAlreadyExistsError(new Error("already exists"))).toBe(false);
  });
});
