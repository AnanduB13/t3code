import { EnvironmentId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { useAgentsSidebarStore } from "./agentsSidebarStore";
import { useAgentEnvironment } from "./useAgentEnvironment";

const local = EnvironmentId.make("desktop");
const remote = EnvironmentId.make("k11");
const state = vi.hoisted(() => ({
  environments: [] as Array<{
    environmentId: string;
    label: string;
    connection: { phase: string };
  }>,
}));

vi.mock("../../state/environments", () => ({
  usePrimaryEnvironmentId: () => "desktop",
  useEnvironments: () => ({ environments: state.environments }),
}));

function setup() {
  state.environments = [
    { environmentId: local, label: "Desktop", connection: { phase: "connected" } },
    { environmentId: remote, label: "K11", connection: { phase: "connected" } },
  ];
  useAgentsSidebarStore.setState(useAgentsSidebarStore.getInitialState());
  const observed = new Map<string, ReturnType<typeof useAgentEnvironment>>();
  function Consumer({ name }: { readonly name: string }) {
    observed.set(name, useAgentEnvironment());
    return null;
  }
  const consumers = () => (
    <>
      <Consumer name="workspace" />
      <Consumer name="sidebar" />
    </>
  );
  return { observed, consumers };
}

it("switches workspace and sidebar together, clears old selections, and retains an offline target", async () => {
  const { observed, consumers } = setup();
  await using screen = await render(consumers(), { router: false }); // no links or navigation
  expect(observed.get("workspace")?.environmentId).toBe(local);
  useAgentsSidebarStore.setState({ selectedTaskId: "local-task", selectedSessionId: "local-chat" });
  await act(() => useAgentsSidebarStore.getState().setEnvironmentId(remote));
  expect(observed.get("workspace")?.environmentId).toBe(remote);
  expect(observed.get("sidebar")?.environmentId).toBe(remote);
  expect(useAgentsSidebarStore.getState().selectedTaskId).toBeNull();
  expect(useAgentsSidebarStore.getState().selectedSessionId).toBeNull();

  state.environments = state.environments.map((entry) =>
    entry.environmentId === remote ? { ...entry, connection: { phase: "offline" } } : entry,
  );
  await screen.rerender(consumers());
  expect(observed.get("workspace")?.environmentId).toBe(remote);
  expect(observed.get("sidebar")?.environment?.connection.phase).toBe("offline");

  await act(() => useAgentsSidebarStore.getState().setEnvironmentId(local));
  expect(observed.get("workspace")?.environmentId).toBe(local);
  expect(observed.get("sidebar")?.environmentId).toBe(local);
});
