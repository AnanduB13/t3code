import { Toolbar } from "../../components/ui/Toolbar";
import { use } from "react";
import { NativePrimaryColumnContext } from "../../native/v5-workspace-context";
import * as Arr from "effect/Array";
import * as Order from "effect/Order";
import { AsyncResult } from "effect/reactivity";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
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
import { Platform, useWindowDimensions } from "react-native";

import * as Dialog from "../../components/ui/Dialog";
import { resolveScratchProjectScopeKey } from "@t3tools/client-runtime/state/project-grouping";

import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useProjects } from "../../state/entities";
import { environmentThreadShells } from "../../state/threads";
import { usePendingNewTasks } from "../../state/use-pending-new-tasks";
import { useWorkspaceState } from "../../state/workspace";
import { useSavedRemoteConnections } from "../../state/use-remote-environment-registry";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { useAdaptiveWorkspaceLayout } from "../layout/AdaptiveWorkspaceLayout";
import { useDeviceType, useNativeColumnLayoutMetrics } from "../../native/native-layout-metrics";
import { WorkspaceEmptyDetail } from "../layout/WorkspaceEmptyDetail";
import { AndroidScreenHeader } from "../../components/ui/AndroidScreenHeader";
import { checkForAppUpdateOnLaunch, startAppUpdateForegroundRecheck } from "../updates/app-updates";
import { AndroidHomeFabLayout } from "./AndroidHomeFab";
import { HomeScreen } from "./HomeScreen";
import { HomeHeader } from "./HomeHeader";
import { useHomeListOptions } from "./home-list-options";
import { useAtomValueWhileVisible, useHomeRouteVisible } from "./home-route-visibility";
import { useHomeThreadSelection } from "./home-thread-navigation";
import { buildHomeProjectScopes } from "./homeThreadList";
import { usePendingTaskListActions } from "./usePendingTaskListActions";
import { useThreadListActions } from "./useThreadListActions";
import { getConnectionAwareBrandHeaderOptions } from "./WorkspaceConnectionTitle";
import { useWorkspaceTabs } from "../workspace/WorkspaceTabsContext";

export function HomeRouteScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const nativePrimaryColumn = use(NativePrimaryColumnContext);
  const columnMetrics = useNativeColumnLayoutMetrics();
  const deviceType = useDeviceType();
  const headerWidth = nativePrimaryColumn ? (columnMetrics?.width ?? windowWidth) : windowWidth;
  const { homeMode, layout, panes, primarySidebarSearchQuery, setPrimarySidebarSearchQuery } =
    useAdaptiveWorkspaceLayout();
  const projects = useProjects();
  // Streaming turns rewrite thread shells many times a second. While a Thread
  // covers Home, rebuilding this list is invisible work.
  const visible = useHomeRouteVisible();
  const threads = useAtomValueWhileVisible(
    environmentThreadShells.navigationThreadShellsAtom,
    visible,
  );
  const { environments: workspaceEnvironments, state: catalogState } = useWorkspaceState();
  const { savedConnectionsById } = useSavedRemoteConnections();
  const navigation = useNavigation();
  const workspace = useWorkspaceTabs();
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const searchQuery =
    Platform.OS === "android"
      ? primarySidebarSearchQuery
      : (workspace?.state.tabs.threads.query ?? localSearchQuery);
  const setSearchQuery = (query: string) => {
    if (Platform.OS === "android") setPrimarySidebarSearchQuery(query);
    else if (workspace) workspace.dispatch({ type: "query", query, tab: "threads" });
    else setLocalSearchQuery(query);
  };
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const handleSelectThread = useHomeThreadSelection();
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const [pendingChatEnvironmentId, setPendingChatEnvironmentId] = useState<EnvironmentId | null>(
    null,
  );
  const handleNewThreadOnBranch = useCallback(
    (thread: EnvironmentThreadShell) => {
      navigation.navigate("NewTaskSheet", {
        screen: "NewTaskDraft",
        params: {
          environmentId: String(thread.environmentId),
          projectId: String(thread.projectId),
          branch: thread.branch,
          worktreePath: thread.worktreePath,
        },
      });
    },
    [navigation],
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
    setThreadAutoSettle,
    moveThread,
    renameThread,
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
    setSelectedProjectKey,
  } = useHomeListOptions(availableEnvironmentIds);
  const selectedEnvironmentId = listOptions.selectedEnvironmentId;
  const projectScopeKey = listOptions.selectedProjectKey;
  const resolvedProjectKey = resolveScratchProjectScopeKey(projectScopeKey, projects, {
    sidebarProjectGroupingMode: listOptions.projectGroupingMode,
    sidebarProjectGroupingOverrides: {},
  });
  useEffect(() => {
    if (resolvedProjectKey !== projectScopeKey) {
      setSelectedProjectKey(resolvedProjectKey);
    }
  }, [projectScopeKey, resolvedProjectKey, setSelectedProjectKey]);
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
  const selectedProjectKey = projectFilterOptions.some(
    (project) => project.key === resolvedProjectKey,
  )
    ? resolvedProjectKey
    : null;
  const deferredSelectedProjectKey = useDeferredValue(selectedProjectKey);
  useEffect(() => {
    if (homeMode === "chats" && projectScopeKey !== null) {
      setSelectedProjectKey(null);
    }
  }, [homeMode, projectScopeKey, setSelectedProjectKey]);

  const openGeneralChatDraft = useCallback(
    (project: EnvironmentProject) => {
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
      Dialog.alert("Could not start chat", "Connect an environment before starting a chat.");
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
      Dialog.alert(
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
  if (layout.usesSplitView && !nativePrimaryColumn) {
    return (
      <>
        <NativeStackScreenOptions
          options={
            Platform.OS === "android"
              ? { headerShown: false }
              : {
                  title: "",
                  headerTitle: "",
                  unstable_headerLeftItems: () => [],
                  headerSearchBarOptions: undefined,
                  unstable_headerRightItems: () => [],
                  unstable_headerToolbarItems: () => [],
                }
          }
        />
        {Platform.OS === "ios" ? (
          <Toolbar placement="left">
            <Toolbar.Button
              accessibilityLabel="New task"
              icon="square.and.pencil"
              onPress={() => navigation.navigate("NewTaskSheet", { screen: "NewTask" })}
            />
          </Toolbar>
        ) : null}
        {Platform.OS === "android" ? <AndroidScreenHeader title="Threads" /> : null}
        <WorkspaceEmptyDetail
          onAddConnection={
            Platform.OS === "android" && !catalogState.hasConnections
              ? () =>
                  navigation.navigate("SettingsSheet", {
                    screen: "SettingsContent",
                    params: { screen: "SettingsEnvironmentNew" },
                  })
              : undefined
          }
          onStartNewTask={
            Platform.OS === "android" && panes.primarySidebarVisible ? undefined : startNewItem
          }
        />
      </>
    );
  }

  return (
    <AndroidHomeFabLayout
      accessibilityLabel={homeMode === "chats" ? "New chat" : "New task"}
      disabled={workspace !== null && Platform.OS !== "android"}
      onStartNewTask={startNewItem}
    >
      <>
        {/* Restore the header after leaving split view; screen options are
            shallow-merged. */}
        {workspace !== null && Platform.OS === "ios" ? null : (
          <NativeStackScreenOptions
            optionsVersion={headerWidth}
            options={{
              ...getConnectionAwareBrandHeaderOptions({
                headerWidth,
                trailingItemCount: nativePrimaryColumn && deviceType === "pad" ? 2 : 1,
                onOpenEnvironments: () =>
                  navigation.navigate("SettingsSheet", {
                    screen: "SettingsContent",
                    params: { screen: "SettingsEnvironments" },
                  }),
              }),
              headerShown: Platform.OS !== "android",
            }}
          />
        )}
        <HomeHeader
          mode={homeMode}
          usesWorkspaceToolbar={workspace !== null}
          environments={environments}
          projects={projectFilterOptions}
          searchQuery={searchQuery}
          selectedEnvironmentId={selectedEnvironmentId}
          selectedProjectKey={selectedProjectKey}
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
          onSearchQueryChange={setSearchQuery}
          onStartNewTask={startNewItem}
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
          onSetThreadAutoSettle={setThreadAutoSettle}
          onMoveThread={moveThread}
          onRenameThread={renameThread}
          onRegenerateThreadTitle={regenerateThreadTitle}
          onEnvironmentChange={setSelectedEnvironmentId}
          onProjectChange={setSelectedProjectKey}
          onOpenSettings={() =>
            navigation.navigate("SettingsSheet", {
              screen: "SettingsContent",
              params: { screen: "Settings" },
            })
          }
          onSearchQueryChange={setSearchQuery}
          onSelectThread={handleSelectThread}
          onSelectPendingTask={openPendingTask}
          onDeletePendingTask={confirmDeletePendingTask}
          onNewThreadOnBranch={handleNewThreadOnBranch}
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
          pendingTasks={pendingTasks}
          projectGroupingMode={listOptions.projectGroupingMode}
          projects={projects}
          projectSortOrder={listOptions.projectSortOrder}
          savedConnectionsById={savedConnectionsById}
          searchQuery={deferredSearchQuery}
          selectedEnvironmentId={selectedEnvironmentId}
          selectedProjectKey={deferredSelectedProjectKey}
          threads={threads}
        />
      </>
    </AndroidHomeFabLayout>
  );
}
