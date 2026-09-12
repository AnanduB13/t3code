import {
  excludeGeneralChatsProject,
  GENERAL_CHATS_PROJECT_ID,
  GENERAL_CHATS_PROJECT_TITLE,
  GENERAL_CHATS_WORKSPACE_ROOT,
  isGeneralChatsProjectAlreadyExistsError,
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
  isGeneralChatsProjectAlreadyExistsError,
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

export function resolveGeneralChatsStorageEnvironmentId(
  environments: ReadonlyArray<{ readonly environmentId: EnvironmentId }>,
  preferredEnvironmentId: EnvironmentId | null,
  primaryEnvironmentId: EnvironmentId | null,
): EnvironmentId | null {
  if (
    preferredEnvironmentId !== null &&
    environments.some(({ environmentId }) => environmentId === preferredEnvironmentId)
  ) {
    return preferredEnvironmentId;
  }
  if (
    primaryEnvironmentId !== null &&
    environments.some(({ environmentId }) => environmentId === primaryEnvironmentId)
  ) {
    return primaryEnvironmentId;
  }
  return environments[0]?.environmentId ?? null;
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
