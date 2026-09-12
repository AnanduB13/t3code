import * as Arr from "effect/Array";
import * as Order from "effect/Order";
import { AsyncResult } from "effect/unstable/reactivity";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import {
  GENERAL_CHATS_PROJECT_ID,
  GENERAL_CHATS_PROJECT_TITLE,
  GENERAL_CHATS_WORKSPACE_ROOT,
  isGeneralChatsProjectAlreadyExistsError,
} from "@t3tools/client-runtime/general-chats";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Alert, Platform, useWindowDimensions } from "react-native";

import { NativeHeaderToolbar, NativeStackScreenOptions } from "../../native/StackHeader";
import { useProjects, useThreadShells } from "../../state/entities";
import { usePendingNewTasks } from "../../state/use-pending-new-tasks";
import { useWorkspaceState } from "../../state/workspace";
import { useSavedRemoteConnections } from "../../state/use-remote-environment-registry";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { scopedProjectKey } from "../../lib/scopedEntities";
import { updateComposerDraftSettings } from "../../state/use-composer-drafts";
import { useAdaptiveWorkspaceLayout } from "../layout/AdaptiveWorkspaceLayout";
import { WorkspaceEmptyDetail } from "../layout/WorkspaceEmptyDetail";
import { WorkspaceSidebarToolbar } from "../layout/workspace-sidebar-toolbar";
import { checkForAppUpdateOnLaunch, startAppUpdateForegroundRecheck } from "../updates/app-updates";
import { AndroidHomeFabLayout } from "./AndroidHomeFab";
import { HomeScreen } from "./HomeScreen";
import { HomeHeader } from "./HomeHeader";
import { useHomeListOptions } from "./home-list-options";
import { useHomeThreadSelection } from "./home-thread-navigation";
import { buildHomeProjectScopes } from "./homeThreadList";
import { usePendingTaskListActions } from "./usePendingTaskListActions";
import { useThreadListActions } from "./useThreadListActions";
import { getConnectionAwareBrandHeaderOptions } from "./WorkspaceConnectionTitle";

/* ─── Route screen ───────────────────────────────────────────────────── */

export function HomeRouteScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const { homeMode, layout } = useAdaptiveWorkspaceLayout();
  const projects = useProjects();
  const threads = useThreadShells();
  const { environments: workspaceEnvironments, state: catalogState } = useWorkspaceState();
  const { savedConnectionsById } = useSavedRemoteConnections();
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const handleSelectThread = useHomeThreadSelection();
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const [pendingChatEnvironmentId, setPendingChatEnvironmentId] = useState<EnvironmentId | null>(
    null,
  );

  useEffect(() => {
    void checkForAppUpdateOnLaunch();
    startAppUpdateForegroundRecheck();
  }, []);

  const {
    archiveThread,
    confirmDeleteThread,
    settleThread,
    snoozeThread,
    unsnoozeThread,
    pinThread,
    unpinThread,
    movePinnedThread,
    regenerateThreadTitle,
    unsettleThread,
  } = useThreadListActions();
  const pendingTasks = usePendingNewTasks();
  const { openPendingTask, confirmDeletePendingTask } = usePendingTaskListActions();
  const environments = useMemo(() => {
    const connectionStateByEnvironmentId = new Map(
      workspaceEnvironments.map(
        (environment) => [environment.environmentId, environment.connectionState] as const,
      ),
    );
    return Arr.sort(
      Object.values(savedConnectionsById).map((connection) => ({
        environmentId: connection.environmentId,
        label: connection.environmentLabel,
        connectionState:
          connectionStateByEnvironmentId.get(connection.environmentId) ?? "available",
      })),
      Order.mapInput(Order.String, (environment: { readonly label: string }) => environment.label),
    );
  }, [savedConnectionsById, workspaceEnvironments]);
  const availableEnvironmentIds = useMemo(
    () => new Set(environments.map((environment) => environment.environmentId)),
    [environments],
  );
  const {
    options: listOptions,
    setSelectedEnvironmentId,
    setProjectSortOrder,
    setThreadSortOrder,
  } = useHomeListOptions(availableEnvironmentIds);
  const selectedEnvironmentId = listOptions.selectedEnvironmentId;
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(null);
  const deferredSelectedProjectKey = useDeferredValue(selectedProjectKey);
  const projectFilterOptions = useMemo(
    () =>
      buildHomeProjectScopes({
        projects,
        environmentId: selectedEnvironmentId,
        projectGroupingMode: listOptions.projectGroupingMode,
      }).map((scope) => ({
        environmentId: scope.representative.environmentId,
        faviconPath: scope.representative.faviconPath,
        key: scope.key,
        label: scope.title,
        workspaceRoot: scope.representative.workspaceRoot,
      })),
    [listOptions.projectGroupingMode, projects, selectedEnvironmentId],
  );
  useEffect(() => {
    if (homeMode === "chats") {
      setSelectedProjectKey(null);
    }
  }, [homeMode]);
  useEffect(() => {
    if (
      selectedProjectKey !== null &&
      !projectFilterOptions.some((project) => project.key === selectedProjectKey)
    ) {
      setSelectedProjectKey(null);
    }
  }, [projectFilterOptions, selectedProjectKey]);

  const openGeneralChatDraft = useCallback(
    (project: EnvironmentProject) => {
      updateComposerDraftSettings(
        `new-task:${scopedProjectKey(project.environmentId, project.id)}`,
        {
          workspaceSelection: {
            mode: "local",
            branch: null,
            worktreePath: null,
            startFromOrigin: false,
          },
        },
      );
      navigation.navigate("NewTaskSheet", {
        screen: "NewTaskDraft",
        params: {
          environmentId: String(project.environmentId),
          projectId: String(project.id),
          title: "New chat",
        },
      });
    },
    [navigation],
  );

  useEffect(() => {
    if (pendingChatEnvironmentId === null) return;
    const project = projects.find(
      (candidate) =>
        candidate.environmentId === pendingChatEnvironmentId &&
        candidate.id === GENERAL_CHATS_PROJECT_ID,
    );
    if (!project) return;
    setPendingChatEnvironmentId(null);
    openGeneralChatDraft(project);
  }, [openGeneralChatDraft, pendingChatEnvironmentId, projects]);

  const startNewItem = useCallback(() => {
    if (homeMode === "projects") {
      navigation.navigate("NewTaskSheet", { screen: "NewTask" });
      return;
    }
    if (pendingChatEnvironmentId !== null) return;

    const targetEnvironment =
      workspaceEnvironments.find(
        (environment) =>
          environment.environmentId === selectedEnvironmentId &&
          environment.connectionState === "connected",
      ) ?? workspaceEnvironments.find((environment) => environment.connectionState === "connected");
    if (!targetEnvironment) {
      Alert.alert("Could not start chat", "Connect an environment before starting a chat.");
      return;
    }

    const existing = projects.find(
      (project) =>
        project.environmentId === targetEnvironment.environmentId &&
        project.id === GENERAL_CHATS_PROJECT_ID,
    );
    if (existing) {
      openGeneralChatDraft(existing);
      return;
    }

    setPendingChatEnvironmentId(targetEnvironment.environmentId);
    void createProject({
      environmentId: targetEnvironment.environmentId,
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
      setPendingChatEnvironmentId(null);
      Alert.alert(
        "Could not start chat",
        error instanceof Error ? error.message : "The chat could not be created.",
      );
    });
  }, [
    createProject,
    homeMode,
    navigation,
    openGeneralChatDraft,
    pendingChatEnvironmentId,
    projects,
    selectedEnvironmentId,
    workspaceEnvironments,
  ]);

  // In split layouts the persistent sidebar IS the thread list — Home becomes
  // an empty detail pane so selecting a thread never transitions layouts.
  if (layout.usesSplitView) {
    return (
      <>
        <NativeStackScreenOptions
          options={
            Platform.OS === "android"
              ? { headerShown: false }
              : { title: "", headerTitle: "", unstable_headerLeftItems: () => [] }
          }
        />
        <WorkspaceSidebarToolbar
          afterSidebarButton={
            <NativeHeaderToolbar.Button
              accessibilityLabel="New task"
              icon="square.and.pencil"
              onPress={() => navigation.navigate("NewTaskSheet", { screen: "NewTask" })}
            />
          }
        />
        <WorkspaceEmptyDetail
          onStartNewTask={() => navigation.navigate("NewTaskSheet", { screen: "NewTask" })}
        />
      </>
    );
  }

  return (
    <AndroidHomeFabLayout
      accessibilityLabel={homeMode === "chats" ? "New chat" : "New task"}
      onStartNewTask={startNewItem}
    >
      <>
        {/* Restore the header after leaving split view; screen options are
            shallow-merged. The brand slot also doubles as the connection
            status surface while an environment reconnects. */}
        <NativeStackScreenOptions
          optionsVersion={windowWidth}
          options={{
            ...getConnectionAwareBrandHeaderOptions({
              headerWidth: windowWidth,
              onOpenEnvironments: () =>
                navigation.navigate("SettingsSheet", {
                  screen: "SettingsContent",
                  params: { screen: "SettingsEnvironments" },
                }),
            }),
            headerShown: true,
          }}
        />
        <HomeHeader
          mode={homeMode}
          environments={environments}
          projects={projectFilterOptions}
          searchQuery={searchQuery}
          selectedEnvironmentId={selectedEnvironmentId}
          selectedProjectKey={selectedProjectKey}
          projectSortOrder={listOptions.projectSortOrder}
          threadSortOrder={listOptions.threadSortOrder}
          onEnvironmentChange={setSelectedEnvironmentId}
          onProjectChange={setSelectedProjectKey}
          onOpenEnvironments={() =>
            navigation.navigate("SettingsSheet", {
              screen: "SettingsContent",
              params: { screen: "SettingsEnvironments" },
            })
          }
          onOpenSettings={() =>
            navigation.navigate("SettingsSheet", {
              screen: "SettingsContent",
              params: { screen: "Settings" },
            })
          }
          onProjectSortOrderChange={setProjectSortOrder}
          onSearchQueryChange={setSearchQuery}
          onStartNewTask={startNewItem}
          onThreadSortOrderChange={setThreadSortOrder}
        />

        <HomeScreen
          mode={homeMode}
          catalogState={catalogState}
          environments={environments}
          onAddConnection={() =>
            navigation.navigate("SettingsSheet", {
              screen: "SettingsContent",
              params: { screen: "SettingsEnvironmentNew" },
            })
          }
          onArchiveThread={archiveThread}
          onDeleteThread={confirmDeleteThread}
          onSettleThread={settleThread}
          onSnoozeThread={snoozeThread}
          onUnsnoozeThread={unsnoozeThread}
          onUnsettleThread={unsettleThread}
          onPinThread={pinThread}
          onUnpinThread={unpinThread}
          onMovePinnedThread={movePinnedThread}
          onRegenerateThreadTitle={regenerateThreadTitle}
          onEnvironmentChange={setSelectedEnvironmentId}
          onProjectChange={setSelectedProjectKey}
          onOpenSettings={() =>
            navigation.navigate("SettingsSheet", {
              screen: "SettingsContent",
              params: { screen: "Settings" },
            })
          }
          onProjectSortOrderChange={setProjectSortOrder}
          onSearchQueryChange={setSearchQuery}
          onSelectThread={handleSelectThread}
          onSelectPendingTask={openPendingTask}
          onDeletePendingTask={confirmDeletePendingTask}
          onNewThreadInProject={(project) => {
            if (project.id === GENERAL_CHATS_PROJECT_ID) {
              openGeneralChatDraft(project);
              return;
            }
            navigation.navigate("NewTaskSheet", {
              screen: "NewTaskDraft",
              params: {
                environmentId: String(project.environmentId),
                projectId: String(project.id),
                title: project.title,
              },
            });
          }}
          onStartNewTask={startNewItem}
          onThreadSortOrderChange={setThreadSortOrder}
          pendingTasks={pendingTasks}
          projectGroupingMode={listOptions.projectGroupingMode}
          projects={projects}
          projectSortOrder={listOptions.projectSortOrder}
          savedConnectionsById={savedConnectionsById}
          searchQuery={deferredSearchQuery}
          selectedEnvironmentId={selectedEnvironmentId}
          selectedProjectKey={deferredSelectedProjectKey}
          threads={threads}
          threadSortOrder={listOptions.threadSortOrder}
        />
      </>
    </AndroidHomeFabLayout>
  );
}
