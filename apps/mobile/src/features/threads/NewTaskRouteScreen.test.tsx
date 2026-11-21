import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

const environmentId = EnvironmentId.make("env-1");

function project(id: string, workspaceRoot: string): EnvironmentProject {
  return {
    environmentId,
    id: ProjectId.make(id),
    title: id,
    workspaceRoot,
    repositoryIdentity: null,
    defaultModelSelection: null,
    defaultThreadEnvMode: "worktree",
    scripts: [],
    createdAt: "2026-10-26T00:00:00Z",
    updatedAt: "2026-10-26T00:00:00Z",
  };
}

const regular = project("app", "/repo/app");
const scratch = project("scratch", "/scratch");

const harness = vi.hoisted(() => ({
  setProject: vi.fn(),
  startGeneralChat: vi.fn(),
  selectDetail: vi.fn(),
  navigation: {
    goBack: vi.fn(),
    getState: () => ({
      routeNames: ["Thread", "NewTaskProject"],
      index: 1,
      routes: [{ name: "Thread", params: { draft: {} } }, { name: "NewTaskProject" }],
    }),
    getParent: () => undefined,
    canGoBack: () => true,
    dispatch: vi.fn(),
    navigate: vi.fn(),
  },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Pressable: (props: {
    accessibilityLabel: string;
    disabled?: boolean;
    onPress: () => void;
    children?: ReactNode;
  }) => (
    <button aria-label={props.accessibilityLabel} disabled={props.disabled} onClick={props.onPress}>
      {props.children}
    </button>
  ),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("gt-react-native", () => ({
  msg: (text: string) => text,
  T: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useGT: () => (text: string) => text,
  useMessages: () => (text: string) => text,
}));
vi.mock("@react-navigation/native", () => ({
  StackActions: { push: (name: string) => ({ type: "PUSH", name }) },
  useIsFocused: () => true,
  useNavigation: () => harness.navigation,
}));
vi.mock("../../components/ui/NavigationRow", () => ({
  NavigationRow: (props: { title: string; disabled?: boolean; onPress?: () => void }) => (
    <button aria-label={props.title} disabled={props.disabled === true} onClick={props.onPress}>
      {props.title}
    </button>
  ),
}));
vi.mock("../../components/ui/Dialog", () => ({ alert: vi.fn() }));
vi.mock("../../components/ui/AppActivityIndicator", () => ({ AppActivityIndicator: () => null }));
vi.mock("../../components/ui/AppBar", () => ({ AppBar: () => null }));
vi.mock("../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../components/ui/Button", () => ({ Button: () => null }));
vi.mock("../../components/ui/ScreenContent", () => ({
  ScreenContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("../../components/ui/ScreenScrollView", () => ({
  ScreenScrollView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("../../components/ui/AppText", () => ({
  AppText: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../../components/ProjectFavicon", () => ({ ProjectFavicon: () => null }));
vi.mock("../connection/environmentStatusText", () => ({ runtimeConnectionErrorText: () => null }));
vi.mock("../../state/entities", () => ({
  useProjects: () => [regular, scratch],
  useServerConfigs: () => new Map([[environmentId, { scratchWorkspaceRoot: "/scratch" }]]),
}));
vi.mock("./useStartGeneralChat", () => ({ useStartGeneralChat: () => harness.startGeneralChat }));
vi.mock("../../state/use-composer-drafts", () => ({ retargetSavedNewTaskDraft: vi.fn() }));
vi.mock("../../state/use-remote-environment-registry", () => ({
  useRemoteConnectionStatus: () => ({
    connectedEnvironments: [{ environmentId, connectionState: "connected" }],
  }),
}));
vi.mock("../../state/workspace", () => ({
  useWorkspaceState: () => ({ state: { hasReadyEnvironment: true } }),
}));
vi.mock("../sharing/IncomingShareProvider", () => ({
  useIncomingShare: () => ({ getShare: () => null, releaseShareReservation: vi.fn() }),
}));
vi.mock("../layout/workspace/useSelectWorkspaceDetail", () => ({
  useSelectWorkspaceDetail: () => harness.selectDetail,
}));
vi.mock("./new-task-flow-provider", () => ({
  useNewTaskFlow: () => ({
    projectScopes: [
      {
        key: "app",
        title: "app",
        representative: regular,
        projects: [regular],
        projectRefs: [],
        pinned: false,
        archived: false,
      },
    ],
    selectedEnvironmentId: environmentId,
    setProject: harness.setProject,
  }),
}));

import { NewTaskRouteScreen } from "./NewTaskRouteScreen";

it("offers standalone chats in place of No project", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  using _root = { [Symbol.dispose]: () => act(() => root.unmount()) };
  act(() => root.render(<NewTaskRouteScreen route={{ params: undefined } as never} />));
  const row = (label: string) => container.querySelector<HTMLElement>(`[aria-label="${label}"]`);

  expect(row("No project")).toBeNull();
  act(() => row("Chats")!.click());

  expect(harness.startGeneralChat).toHaveBeenCalledTimes(1);
});
