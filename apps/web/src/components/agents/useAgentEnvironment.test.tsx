import { EnvironmentId } from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { useAgentsSidebarStore } from "./agentsSidebarStore";
import { useAgentEnvironment } from "./useAgentEnvironment";

const local = EnvironmentId.make("desktop");
const remote = EnvironmentId.make("k11");
let environments = [
  { environmentId: local, label: "Desktop", connection: { phase: "connected" } },
  { environmentId: remote, label: "K11", connection: { phase: "connected" } },
];

vi.mock("../../state/environments", () => ({
  usePrimaryEnvironmentId: () => local,
  useEnvironments: () => ({ environments }),
}));

let renderer: ReactTestRenderer | undefined;
const observed = new Map<string, ReturnType<typeof useAgentEnvironment>>();
function Consumer({ name }: { readonly name: string }) {
  observed.set(name, useAgentEnvironment());
  return null;
}
const consumers = (
  <>
    <Consumer name="workspace" />
    <Consumer name="sidebar" />
  </>
);

afterEach(async () => {
  await act(async () => renderer?.unmount());
  useAgentsSidebarStore.setState(useAgentsSidebarStore.getInitialState());
  vi.unstubAllGlobals();
});

it("switches workspace and sidebar together, clears old selections, and retains an offline target", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(async () => {
    renderer = create(consumers);
  });
  expect(observed.get("workspace")?.environmentId).toBe(local);
  useAgentsSidebarStore.setState({ selectedTaskId: "local-task", selectedSessionId: "local-chat" });
  await act(async () => useAgentsSidebarStore.getState().setEnvironmentId(remote));
  expect(observed.get("workspace")?.environmentId).toBe(remote);
  expect(observed.get("sidebar")?.environmentId).toBe(remote);
  expect(useAgentsSidebarStore.getState().selectedTaskId).toBeNull();
  expect(useAgentsSidebarStore.getState().selectedSessionId).toBeNull();

  environments = environments.map((entry) =>
    entry.environmentId === remote ? { ...entry, connection: { phase: "offline" } } : entry,
  );
  await act(async () =>
    renderer?.update(
      <>
        <Consumer name="workspace" />
        <Consumer name="sidebar" />
      </>,
    ),
  );
  expect(observed.get("workspace")?.environmentId).toBe(remote);
  expect(observed.get("sidebar")?.environment?.connection.phase).toBe("offline");

  await act(async () => useAgentsSidebarStore.getState().setEnvironmentId(local));
  expect(observed.get("workspace")?.environmentId).toBe(local);
  expect(observed.get("sidebar")?.environmentId).toBe(local);
});
