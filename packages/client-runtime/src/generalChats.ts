import { ProjectId } from "@t3tools/contracts";

export const GENERAL_CHATS_PROJECT_ID = ProjectId.make("t3code-general-chats");
export const GENERAL_CHATS_PROJECT_TITLE = "Chats";
export const GENERAL_CHATS_WORKSPACE_ROOT = "~/.t3/chats";

export function isGeneralChatsProjectId(projectId: ProjectId): boolean {
  return projectId === GENERAL_CHATS_PROJECT_ID;
}

export function isGeneralChatsProject<T extends { readonly id: ProjectId }>(project: T): boolean {
  return isGeneralChatsProjectId(project.id);
}

export function excludeGeneralChatsProject<T extends { readonly id: ProjectId }>(
  projects: ReadonlyArray<T>,
): T[] {
  return projects.filter((project) => !isGeneralChatsProject(project));
}

export function excludeGeneralChatsThreads<T extends { readonly projectId: ProjectId }>(
  threads: ReadonlyArray<T>,
): T[] {
  return threads.filter((thread) => !isGeneralChatsProjectId(thread.projectId));
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

  return (
    error instanceof Error &&
    error.message.includes("Orchestration command invariant failed (project.create):") &&
    error.message.includes(detail)
  );
}
