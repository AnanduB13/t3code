import type { HermesAgentStatus } from "@t3tools/contracts";

export type HermesConnectionState = "connecting" | "connected" | "offline" | "error";

export function resolveHermesConnectionState(input: {
  readonly status: HermesAgentStatus | null;
  readonly isPending: boolean;
  readonly error: string | null;
}): HermesConnectionState {
  if (input.status?.available === true) return "connected";
  if (input.status?.available === false) return "offline";
  if (input.error !== null) return "error";
  return "connecting";
}
