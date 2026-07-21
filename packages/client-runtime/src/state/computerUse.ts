import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

export function createComputerUseEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const scheduler = createAtomCommandScheduler();
  return {
    requests: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:computer-use:requests",
      tag: WS_METHODS.computerUseConnect,
      idleTtlMs: 0,
    }),
    respond: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:computer-use:respond",
      tag: WS_METHODS.computerUseRespond,
      scheduler,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId, input }) =>
          JSON.stringify([environmentId, input.connectionId, input.requestId]),
      },
    }),
  };
}
