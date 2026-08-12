import type { EnvironmentId } from "@t3tools/contracts";

import { randomUUID } from "~/lib/utils";

const FINDER_REVEAL_KEY = "t3code:finder-reveal:v1";

export interface FinderRevealRequest {
  readonly environmentId: EnvironmentId;
  readonly fullPath: string;
  readonly requestId: string;
}

export function requestFinderReveal(input: {
  readonly environmentId: EnvironmentId;
  readonly fullPath: string;
}) {
  if (typeof window === "undefined") return;
  const request: FinderRevealRequest = {
    ...input,
    requestId: randomUUID(),
  };
  sessionStorage.setItem(FINDER_REVEAL_KEY, JSON.stringify(request));
}

export function readFinderRevealRequest(): FinderRevealRequest | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(FINDER_REVEAL_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      "environmentId" in value &&
      typeof value.environmentId === "string" &&
      "fullPath" in value &&
      typeof value.fullPath === "string" &&
      "requestId" in value &&
      typeof value.requestId === "string"
    ) {
      return value as FinderRevealRequest;
    }
  } catch {
    // Ignore stale or malformed navigation state.
  }
  return null;
}

export function clearFinderRevealRequest(requestId: string) {
  if (typeof window === "undefined") return;
  const current = readFinderRevealRequest();
  if (current?.requestId === requestId) sessionStorage.removeItem(FINDER_REVEAL_KEY);
}
