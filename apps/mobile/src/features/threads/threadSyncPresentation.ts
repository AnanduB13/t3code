import type { EnvironmentThreadStatus } from "@t3tools/client-runtime/state/threads";

import type { ThreadContentPresentation } from "./threadContentPresentation";

export type ThreadSyncPhase = "loading" | "syncing" | null;

export function threadSyncPhase(input: {
  readonly status?: EnvironmentThreadStatus;
  readonly contentKind: ThreadContentPresentation["kind"];
}): ThreadSyncPhase {
  if (input.status !== "synchronizing") {
    return null;
  }

  return input.contentKind === "ready"
    ? "syncing"
    : input.contentKind === "loading"
      ? "loading"
      : null;
}
