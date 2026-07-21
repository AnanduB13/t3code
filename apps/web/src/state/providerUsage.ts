import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";

export const providerUsageQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "web-provider-usage",
  tag: WS_METHODS.serverGetProviderUsage,
  staleTimeMs: 60_000,
  refreshIntervalMs: 5 * 60_000,
});
