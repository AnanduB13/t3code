import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";
import { connectionAtomRuntime } from "../connection/runtime";

export const agentDiscoveryQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "web-agent-discovery",
  tag: WS_METHODS.agentsDiscover,
  staleTimeMs: 10_000,
  refreshIntervalMs: 60_000,
});
