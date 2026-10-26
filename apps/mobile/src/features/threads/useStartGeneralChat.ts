import { useCallback, useEffect, useState } from "react";
import { AsyncResult } from "effect/reactivity";
import {
  GENERAL_CHATS_PROJECT_ID,
  GENERAL_CHATS_PROJECT_TITLE,
  GENERAL_CHATS_WORKSPACE_ROOT,
  isGeneralChatsProjectAlreadyExistsError,
} from "@t3tools/client-runtime/general-chats";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId } from "@t3tools/contracts";

import * as Dialog from "../../components/ui/Dialog";
import { useProjects } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { useWorkspaceState } from "../../state/workspace";

/** Opens a standalone chat once its environment's Chats project is available. */
export function useStartGeneralChat(
  selectedEnvironmentId: EnvironmentId | null,
  openDraft: (project: EnvironmentProject) => void,
) {
  const projects = useProjects();
  const { environments } = useWorkspaceState();
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const [pendingEnvironmentId, setPendingEnvironmentId] = useState<EnvironmentId | null>(null);
  // oxlint-disable-next-line t3code/react-effect-budget -- Open the draft only after the server shell publishes the newly created Chats project.
  useEffect(() => {
    if (pendingEnvironmentId === null) return;
    const project = projects.find(
      (candidate) =>
        candidate.environmentId === pendingEnvironmentId &&
        candidate.id === GENERAL_CHATS_PROJECT_ID,
    );
    if (!project) return;
    // oxlint-disable-next-line react/set-state-in-effect -- The server project projection completes this pending navigation.
    setPendingEnvironmentId(null);
    openDraft(project);
  }, [openDraft, pendingEnvironmentId, projects]);

  return useCallback(() => {
    if (pendingEnvironmentId !== null) return;
    const environment =
      environments.find(
        (candidate) =>
          candidate.environmentId === selectedEnvironmentId &&
          candidate.connectionState === "connected",
      ) ?? environments.find((candidate) => candidate.connectionState === "connected");
    if (!environment) {
      Dialog.alert("Could not start chat", "Connect an environment before starting a chat.");
      return;
    }
    const existing = projects.find(
      (project) =>
        project.environmentId === environment.environmentId &&
        project.id === GENERAL_CHATS_PROJECT_ID,
    );
    if (existing) return openDraft(existing);
    setPendingEnvironmentId(environment.environmentId);
    void createProject({
      environmentId: environment.environmentId,
      input: {
        projectId: GENERAL_CHATS_PROJECT_ID,
        title: GENERAL_CHATS_PROJECT_TITLE,
        workspaceRoot: GENERAL_CHATS_WORKSPACE_ROOT,
        createWorkspaceRootIfMissing: true,
        defaultModelSelection: null,
      },
    }).then((result) => {
      if (!AsyncResult.isFailure(result)) return;
      const error = squashAtomCommandFailure(result);
      if (isGeneralChatsProjectAlreadyExistsError(error)) return;
      setPendingEnvironmentId(null);
      Dialog.alert(
        "Could not start chat",
        error instanceof Error ? error.message : "The chat could not be created.",
      );
    });
  }, [
    createProject,
    environments,
    openDraft,
    pendingEnvironmentId,
    projects,
    selectedEnvironmentId,
  ]);
}
