import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";

export interface ThreadVisit {
  threadKey: string;
  visitedAt: string;
  markUnread?: true;
}

const listeners = new Set<(visit: ThreadVisit) => void>();

export function publishThreadVisit(visit: ThreadVisit): void {
  for (const listener of listeners) listener(visit);
}

export function subscribeThreadVisits(listener: (visit: ThreadVisit) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Mirrors authoritative receipts without re-publishing them as user actions. */
export function createThreadVisitSync(input: {
  readLocal: (key: string) => string | undefined;
  apply: (key: string, value: string | undefined) => void;
  send: (visit: ThreadVisit) => Promise<boolean>;
}) {
  const canonical = new Map<string, string | undefined>();
  const pending = new Map<string, Promise<void>>();

  function visit(visit: ThreadVisit): Promise<void> | undefined {
    const { threadKey, visitedAt, markUnread } = visit;
    const current = canonical.get(threadKey);
    if (
      !pending.has(threadKey) &&
      current !== undefined &&
      (markUnread ? current === visitedAt : Date.parse(current) >= Date.parse(visitedAt))
    )
      return;
    const previous = pending.get(threadKey) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        const success = await input.send(visit);
        if (!success && pending.get(threadKey) === next) {
          input.apply(threadKey, canonical.get(threadKey));
        }
      })
      .finally(() => {
        if (pending.get(threadKey) === next) pending.delete(threadKey);
      });
    pending.set(threadKey, next);
    return next;
  }

  return {
    visit,
    update(
      threads: readonly Pick<EnvironmentThreadShell, "id" | "environmentId" | "lastVisitedAt">[],
    ) {
      for (const thread of threads) {
        const key = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
        const value = thread.lastVisitedAt ?? undefined;
        const first = !canonical.has(key);
        if (!first && canonical.get(key) === value) continue;
        canonical.set(key, value);
        if (value !== undefined) {
          input.apply(key, value);
        } else if (first) {
          // Seed the shared record once from this installation's existing history.
          const local = input.readLocal(key);
          if (local !== undefined) visit({ threadKey: key, visitedAt: local });
        }
      }
    },
  };
}
