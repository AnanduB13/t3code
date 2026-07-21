import { WS_METHODS } from "@t3tools/contracts";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const threadGoalEnvironment = {
  get: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:thread-goal:get",
    tag: WS_METHODS.threadGoalGet,
  }),
  set: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:thread-goal:set",
    tag: WS_METHODS.threadGoalSet,
    concurrency: { mode: "latest", key: (target) => target.input.threadId },
  }),
  clear: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:thread-goal:clear",
    tag: WS_METHODS.threadGoalClear,
    concurrency: { mode: "latest", key: (target) => target.input.threadId },
  }),
};
