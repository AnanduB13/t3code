import { useAtomValue } from "@effect/atom-react";
import type { ServerConfig } from "@t3tools/contracts";
import { withLegacyUsageLimits } from "@t3tools/shared/usageLimits";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentPresentations } from "./presentation";
import { providerUsageQuery } from "./providerUsage";
import { serverEnvironment } from "./server";
import { useAtomCommand } from "./use-atom-command";

function usesLegacyLimits(config: ServerConfig): boolean {
  return (
    config.environment.capabilities.usageLimitSources !== true &&
    !config.providers.some((provider) => provider.usageLimits !== undefined)
  );
}

/** Prefer streamed quotas and credits; older environments still expose their legacy reader. */
export const usageLimitsStateAtom = Atom.make((get) => {
  const presentations = get(environmentPresentations.presentationsAtom);
  let pending = false;
  const limitsPresentations = new Map(presentations);
  for (const [environmentId, presentation] of presentations) {
    const config = presentation.serverConfig;
    if (!config || presentation.connection.phase !== "connected" || !usesLegacyLimits(config)) {
      continue;
    }
    const result = get(providerUsageQuery({ environmentId, input: {} }));
    pending ||= result.waiting;
    if (AsyncResult.isSuccess(result)) {
      limitsPresentations.set(environmentId, {
        ...presentation,
        serverConfig: {
          ...config,
          providers: withLegacyUsageLimits(config.providers, result.value.providers),
        },
      });
    } else if (AsyncResult.isFailure(result)) {
      limitsPresentations.set(environmentId, {
        ...presentation,
        serverConfig: {
          ...config,
          providers: config.providers.map((provider) => ({
            ...provider,
            usageLimits: {
              checkedAt: provider.checkedAt,
              windows: [],
              unavailable: {
                reason: "probeFailed" as const,
                message: "Could not load account limits. Try refreshing.",
              },
            },
          })),
        },
      });
    }
  }
  return { presentations: limitsPresentations, pending };
}).pipe(Atom.withLabel("web-usage-limits"));

export function useUsageLimitsRefresh(enabled: boolean) {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders);
  const [now, setNow] = useState(Date.now);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const refresh = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      await Promise.all(
        [...presentations].map(async ([environmentId, presentation]) => {
          const config = presentation.serverConfig;
          if (presentation.connection.phase !== "connected" || !config) return;
          if (usesLegacyLimits(config)) {
            appAtomRegistry.refresh(providerUsageQuery({ environmentId, input: {} }));
          }
          await refreshProviders({ environmentId, input: {} });
        }),
      );
    } finally {
      inFlight.current = false;
      setRefreshing(false);
      setNow(Date.now());
    }
  };
  const connectedIds = [...presentations]
    .filter(
      ([, presentation]) =>
        presentation.connection.phase === "connected" && presentation.serverConfig,
    )
    .map(([id]) => id)
    .sort()
    .join(",");
  const autoRefresh = useEffectEvent(() => {
    void refresh();
  });
  useEffect(() => {
    if (enabled && connectedIds) autoRefresh();
  }, [enabled, connectedIds]);

  return { now, refresh, refreshing };
}
