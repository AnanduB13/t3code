import { EnvironmentId, type AgentDiscoveryResult } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { AgentsOverview } from "./AgentsOverview";
import { useAgentsSidebarStore } from "./agentsSidebarStore";

const local = EnvironmentId.make("desktop");
const remote = EnvironmentId.make("k11");
const state = vi.hoisted(() => ({
  environments: [] as Array<{
    environmentId: string;
    label: string;
    connection: { phase: string };
  }>,
  results: new Map<
    string,
    { data: AgentDiscoveryResult | null; error: string | null; refresh: () => void }
  >(),
}));

vi.mock(import("../../state/environments"), async (original) => ({
  ...(await original()),
  useEnvironments: (() => ({ environments: state.environments, isReady: true })) as never,
}));
vi.mock(import("../../state/agentDiscovery"), async (original) => ({
  ...(await original()),
  agentDiscoveryQuery: (({ environmentId }: { environmentId: EnvironmentId }) =>
    environmentId) as never,
}));
vi.mock(import("../../state/query"), async (original) => ({
  ...(await original()),
  useEnvironmentQuery: ((id: EnvironmentId | null) => ({
    ...state.results.get(id ?? "desktop"),
    isPending: false,
  })) as never,
}));

function setup() {
  const localRefresh = vi.fn();
  const remoteRefresh = vi.fn();
  useAgentsSidebarStore.setState(useAgentsSidebarStore.getInitialState());
  state.environments = [
    { environmentId: local, label: "Desktop", connection: { phase: "connected" } },
    { environmentId: remote, label: "K11", connection: { phase: "connected" } },
  ];
  state.results.clear();
  state.results.set(local, {
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
  state.results.set(remote, {
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
  return { localRefresh, remoteRefresh };
}

it("shows both computers and opens Hermes on the selected host with no stale selection", async () => {
  setup();
  await using screen = await render(<AgentsOverview />);
  const desktop = screen.getByRole("region", { name: "Agents on Desktop" });
  const k11 = screen.getByRole("region", { name: "Agents on K11" });
  await expect.element(desktop).toMatchTextContent("Research assistant");
  await expect.element(desktop).toMatchTextContent("Not reachable");
  await expect.element(k11).toMatchTextContent("K11 model");

  useAgentsSidebarStore.setState({
    environmentId: local,
    selectedSessionId: "desktop-chat",
    selectedTaskId: "desktop-task",
  });
  await k11.getByRole("button", { name: "Open Hermes" }).click();
  expect(useAgentsSidebarStore.getState()).toMatchObject({
    environmentId: remote,
    agentView: "hermes",
    selectedSessionId: null,
    selectedTaskId: null,
  });
  await act(() => useAgentsSidebarStore.getState().showOverview());
  expect(useAgentsSidebarStore.getState().agentView).toBe("overview");
});

it("keeps K11 visible when the local connection fails and refreshes only K11", async () => {
  const { localRefresh, remoteRefresh } = setup();
  state.results.set(local, { data: null, error: "Connection failed", refresh: localRefresh });
  await using screen = await render(<AgentsOverview />);
  await expect
    .element(screen.getByRole("region", { name: "Agents on Desktop" }))
    .toMatchTextContent("Connection failed");
  await expect
    .element(screen.getByRole("region", { name: "Agents on K11" }))
    .toMatchTextContent("Running");
  await screen.getByRole("button", { name: "Refresh agents on K11" }).click();
  expect(remoteRefresh).toHaveBeenCalledOnce();
  expect(localRefresh).not.toHaveBeenCalled();
});

it("replaces cached running status when a computer disconnects and restores it on reconnect", async () => {
  setup();
  await using screen = await render(<AgentsOverview />);
  state.environments = state.environments.map((environment) =>
    environment.environmentId === local
      ? { ...environment, connection: { phase: "offline" } }
      : environment,
  );
  await screen.rerender(<AgentsOverview />);
  const desktop = screen.getByRole("region", { name: "Agents on Desktop" });
  await expect.element(desktop).toMatchTextContent("Computer disconnected");
  await expect.element(desktop).not.toMatchTextContent("Research assistant");
  await expect
    .element(screen.getByRole("region", { name: "Agents on K11" }))
    .toMatchTextContent("Running");

  state.environments = state.environments.map((environment) => ({
    ...environment,
    connection: { phase: "connected" },
  }));
  await screen.rerender(<AgentsOverview />);
  await expect.element(desktop).toMatchTextContent("Research assistant");
});
