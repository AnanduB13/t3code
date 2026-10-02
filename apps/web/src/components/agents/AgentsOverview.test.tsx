import { EnvironmentId, type AgentDiscoveryResult } from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer, type ReactTestInstance } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { AgentsOverview } from "./AgentsOverview";
import { useAgentsSidebarStore } from "./agentsSidebarStore";

const local = EnvironmentId.make("desktop");
const remote = EnvironmentId.make("k11");
let environments = [
  { environmentId: local, label: "Desktop", connection: { phase: "connected" } },
  { environmentId: remote, label: "K11", connection: { phase: "connected" } },
];
const results = new Map<
  EnvironmentId,
  { data: AgentDiscoveryResult | null; error: string | null; refresh: () => void }
>();
const localRefresh = vi.fn();
const remoteRefresh = vi.fn();

vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({ environments, isReady: true }),
}));
vi.mock("../../state/agentDiscovery", () => ({
  agentDiscoveryQuery: ({ environmentId }: { environmentId: EnvironmentId }) => environmentId,
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (id: EnvironmentId | null) => ({
    ...results.get(id ?? local),
    isPending: false,
  }),
}));
vi.mock("../../workspaceTitlebar", () => ({ COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS: "" }));
vi.mock("@tanstack/react-router", () => ({ Link: "a" }));
vi.mock("../ui/sidebar", () => ({ SidebarInset: "main" }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/badge", () => ({ Badge: "span" }));

let renderer: ReactTestRenderer | undefined;
function text(node: ReactTestInstance | string): string {
  return typeof node === "string" ? node : node.children.map(text).join("");
}
function root() {
  if (!renderer) throw new Error("Not mounted");
  return renderer.root;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  environments = environments.map((environment) => ({
    ...environment,
    connection: { phase: "connected" },
  }));
  results.set(local, {
    error: null,
    refresh: localRefresh,
    data: {
      hostname: "desktop",
      runtimes: [
        { kind: "hermes", state: "unavailable", endpoint: null, agents: [] },
        {
          kind: "openclaw",
          state: "running",
          endpoint: "http://127.0.0.1:18789",
          agents: [{ id: "research", name: "Research assistant" }],
        },
      ],
    },
  });
  results.set(remote, {
    error: null,
    refresh: remoteRefresh,
    data: {
      hostname: "k11",
      runtimes: [
        {
          kind: "hermes",
          state: "running",
          endpoint: "http://127.0.0.1:8642",
          agents: [],
          model: "K11 model",
        },
      ],
    },
  });
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  useAgentsSidebarStore.setState(useAgentsSidebarStore.getInitialState());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("shows both computers and opens Hermes on the selected host with no stale selection", async () => {
  await act(async () => {
    renderer = create(<AgentsOverview />);
  });
  const desktop = root().findByProps({ "aria-label": "Agents on Desktop" });
  const k11 = root().findByProps({ "aria-label": "Agents on K11" });
  expect(text(desktop)).toContain("Research assistant");
  expect(text(desktop)).toContain("Not reachable");
  expect(text(k11)).toContain("K11 model");

  useAgentsSidebarStore.setState({
    environmentId: local,
    selectedSessionId: "desktop-chat",
    selectedTaskId: "desktop-task",
  });
  await act(async () => {
    k11
      .findAllByType("button")
      .find((button) => text(button) === "Open Hermes")
      ?.props.onClick();
  });
  expect(useAgentsSidebarStore.getState()).toMatchObject({
    environmentId: remote,
    agentView: "hermes",
    selectedSessionId: null,
    selectedTaskId: null,
  });
  await act(async () => useAgentsSidebarStore.getState().showOverview());
  expect(useAgentsSidebarStore.getState().agentView).toBe("overview");
});

it("keeps K11 visible when the local connection fails and refreshes only K11", async () => {
  results.set(local, { data: null, error: "Connection failed", refresh: localRefresh });
  await act(async () => {
    renderer = create(<AgentsOverview />);
  });
  expect(text(root().findByProps({ "aria-label": "Agents on Desktop" }))).toContain(
    "Connection failed",
  );
  expect(text(root().findByProps({ "aria-label": "Agents on K11" }))).toContain("Running");
  await act(async () =>
    root().findByProps({ "aria-label": "Refresh agents on K11" }).props.onClick(),
  );
  expect(remoteRefresh).toHaveBeenCalledOnce();
  expect(localRefresh).not.toHaveBeenCalled();
});

it("replaces cached running status when a computer disconnects and restores it on reconnect", async () => {
  await act(async () => {
    renderer = create(<AgentsOverview />);
  });
  environments = environments.map((environment) =>
    environment.environmentId === local
      ? { ...environment, connection: { phase: "offline" } }
      : environment,
  );
  await act(async () => renderer?.update(<AgentsOverview />));
  const desktop = root().findByProps({ "aria-label": "Agents on Desktop" });
  expect(text(desktop)).toContain("Computer disconnected");
  expect(text(desktop)).not.toContain("Research assistant");
  expect(text(root().findByProps({ "aria-label": "Agents on K11" }))).toContain("Running");

  environments = environments.map((environment) => ({
    ...environment,
    connection: { phase: "connected" },
  }));
  await act(async () => renderer?.update(<AgentsOverview />));
  expect(text(root().findByProps({ "aria-label": "Agents on Desktop" }))).toContain(
    "Research assistant",
  );
});
