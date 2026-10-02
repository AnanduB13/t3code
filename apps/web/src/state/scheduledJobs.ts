import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";
import { connectionAtomRuntime } from "../connection/runtime";

export const scheduledJobsEnvironment = {
  list: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "scheduled-jobs",
    tag: WS_METHODS.scheduledList,
    staleTimeMs: 5_000,
    refreshIntervalMs: 15_000,
  }),
  save: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "scheduled-jobs:save",
    tag: WS_METHODS.scheduledSave,
  }),
  setEnabled: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "scheduled-jobs:set-enabled",
    tag: WS_METHODS.scheduledSetEnabled,
  }),
  remove: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "scheduled-jobs:delete",
    tag: WS_METHODS.scheduledDelete,
  }),
  run: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "scheduled-jobs:run",
    tag: WS_METHODS.scheduledRun,
  }),
};
