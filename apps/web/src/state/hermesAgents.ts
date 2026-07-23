import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";

export const hermesAgentEnvironment = {
  status: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "web-hermes-agent-status",
    tag: WS_METHODS.agentsHermesStatus,
    staleTimeMs: 10_000,
    refreshIntervalMs: 15_000,
  }),
  sessions: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "web-hermes-agent-sessions",
    tag: WS_METHODS.agentsHermesListSessions,
    staleTimeMs: 2_000,
  }),
  cronJobs: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "web-hermes-agent-cron-jobs",
    tag: WS_METHODS.agentsHermesListCronJobs,
    staleTimeMs: 5_000,
    refreshIntervalMs: 30_000,
  }),
  cronRuns: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "web-hermes-agent-cron-runs",
    tag: WS_METHODS.agentsHermesListCronRuns,
    staleTimeMs: 10_000,
  }),
  messages: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "web-hermes-agent-messages",
    tag: WS_METHODS.agentsHermesGetMessages,
    staleTimeMs: 1_000,
  }),
  createSession: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "hermes-agent:create-session",
    tag: WS_METHODS.agentsHermesCreateSession,
  }),
  updateSession: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "hermes-agent:update-session",
    tag: WS_METHODS.agentsHermesUpdateSession,
  }),
  forkSession: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "hermes-agent:fork-session",
    tag: WS_METHODS.agentsHermesForkSession,
  }),
  deleteSession: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "hermes-agent:delete-session",
    tag: WS_METHODS.agentsHermesDeleteSession,
  }),
  sendMessage: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "hermes-agent:send-message",
    tag: WS_METHODS.agentsHermesSendMessage,
    concurrency: { mode: "singleFlight", key: (target) => target.input.sessionId },
  }),
};
