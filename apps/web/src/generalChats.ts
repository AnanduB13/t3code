import {
  excludeGeneralChatsProject,
  GENERAL_CHATS_PROJECT_ID,
  GENERAL_CHATS_PROJECT_TITLE,
  GENERAL_CHATS_WORKSPACE_ROOT,
  isGeneralChatsProject,
} from "@t3tools/client-runtime/general-chats";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

import type { DraftThreadEnvMode } from "./composerDraftStore";
import type { Project } from "./types";

export {
  excludeGeneralChatsProject,
  GENERAL_CHATS_PROJECT_ID,
  GENERAL_CHATS_PROJECT_TITLE,
  GENERAL_CHATS_WORKSPACE_ROOT,
  isGeneralChatsProject,
};
export const GENERAL_CHAT_NEW_THREAD_OPTIONS = {
  branch: null,
  worktreePath: null,
  envMode: "local",
  startFromOrigin: false,
  forceNewDraft: true,
} as const;

export interface GeneralChatNewThreadOptions {
  readonly branch?: string | null;
  readonly worktreePath?: string | null;
  readonly envMode?: DraftThreadEnvMode;
  readonly startFromOrigin?: boolean;
  readonly forceNewDraft?: boolean;
}

export function findGeneralChatsProject(
  projects: ReadonlyArray<Project>,
  environmentId: EnvironmentId | null,
): Project | null {
  if (environmentId === null) {
    return null;
  }

  return (
    projects.find(
      (project) => project.environmentId === environmentId && isGeneralChatsProject(project),
    ) ?? null
  );
}

export function getGeneralChatNewThreadOptions(projectId: ProjectId) {
  return projectId === GENERAL_CHATS_PROJECT_ID ? GENERAL_CHAT_NEW_THREAD_OPTIONS : undefined;
}

export function resolveGeneralChatNewThreadOptions(
  projectId: ProjectId,
  options?: GeneralChatNewThreadOptions,
): GeneralChatNewThreadOptions | undefined {
  const generalChatOptions = getGeneralChatNewThreadOptions(projectId);
  return generalChatOptions ? { ...options, ...generalChatOptions } : options;
}

export function isGeneralChatsProjectAlreadyExistsError(error: unknown): boolean {
  const detail = `Project '${GENERAL_CHATS_PROJECT_ID}' already exists and cannot be created twice.`;
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as Record<string, unknown>;
  if (
    candidate._tag === "OrchestrationCommandInvariantError" &&
    candidate.commandType === "project.create" &&
    candidate.detail === detail
  ) {
    return true;
  }

  // RPC failures arrive at the UI as an Error with its typed invariant
  // flattened into the message. Treat only this exact idempotent create race
  // as success; every other project-create failure remains visible.
  return (
    error instanceof Error &&
    error.message.includes("Orchestration command invariant failed (project.create):") &&
    error.message.includes(detail)
  );
}
