import type {
  EnvironmentId,
  ProviderUsageResult,
  ServerConfig,
  ServerProvider,
  UsageModelFilter,
  UsageSummaryInput,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { AsyncResult, Atom, type AtomRegistry } from "effect/reactivity";
import { withLegacyUsageLimits } from "@t3tools/shared/usageLimits";

import { EnvironmentRpcUnavailableError } from "../rpc/client.ts";
import type { createEnvironmentPresentationAtoms } from "./presentation.ts";
import { executeAtomQuery, runAtomCommand, squashAtomCommandFailure } from "./runtime.ts";
import type { createServerEnvironmentAtoms } from "./server.ts";

const isEnvironmentRpcUnavailable = Schema.is(EnvironmentRpcUnavailableError);

/** Stream current quotas; only mount the polling reader for older environments. */
export function createUsageLimitProvidersAtom<E>(input: {
  readonly configValueAtom: (environmentId: EnvironmentId) => Atom.Atom<ServerConfig | null>;
  readonly legacyQuery: (
    environmentId: EnvironmentId,
  ) => Atom.Atom<AsyncResult.AsyncResult<ProviderUsageResult, E>>;
}) {
  return Atom.family((environmentId: EnvironmentId) =>
    Atom.make((get): readonly ServerProvider[] => {
      const config = get(input.configValueAtom(environmentId));
      if (!config) return [];
      if (
        config.environment.capabilities.usageLimitSources === true ||
        config.providers.some((provider) => provider.usageLimits !== undefined)
      ) {
        return config.providers;
      }
      const result = get(input.legacyQuery(environmentId));
      return AsyncResult.isSuccess(result)
        ? withLegacyUsageLimits(config.providers, result.value.providers)
        : config.providers;
    }).pipe(Atom.withLabel(`composer-usage-providers:${environmentId}`)),
  );
}

/** The Usage tab asks each environment with that environment's configured model filter. */
export function usageSummaryInput(
  input: UsageSummaryInput,
  modelFilter: UsageModelFilter | undefined,
): UsageSummaryInput {
  return modelFilter === undefined ? input : { ...input, modelFilter };
}

const limitsRefreshAfter = new Map<EnvironmentId, number>();
const limitsRefreshes = new Map<EnvironmentId, Promise<unknown>>();

export async function refreshUsageLimits<A>(
  environmentId: EnvironmentId,
  refresh: () => Promise<A>,
  automatic = false,
): Promise<A | undefined> {
  const pending = limitsRefreshes.get(environmentId);
  if (pending !== undefined) {
    return automatic ? undefined : ((await pending) as A);
  }
  const refreshAfter = limitsRefreshAfter.get(environmentId) ?? 0;
  // @effect-diagnostics-next-line globalDate:off
  if (automatic && Date.now() < refreshAfter) return;
  const current = Promise.resolve()
    .then(refresh)
    .finally(() => {
      limitsRefreshes.delete(environmentId);
      // @effect-diagnostics-next-line globalDate:off
      limitsRefreshAfter.set(environmentId, Date.now() + 5 * 60_000);
    });
  limitsRefreshes.set(environmentId, current);
  return await current;
}

export async function refreshUsage({
  registry,
  server,
  presentations,
  environmentIds,
  input,
}: {
  registry: AtomRegistry.AtomRegistry;
  server: Pick<
    ReturnType<typeof createServerEnvironmentAtoms>,
    "usageSummary" | "refreshUsageRates" | "usageModelFilterAtom"
  >;
  presentations: Pick<ReturnType<typeof createEnvironmentPresentationAtoms>, "presentationAtom">;
  environmentIds: readonly EnvironmentId[];
  input: UsageSummaryInput;
}): Promise<void> {
  await Promise.all(
    environmentIds.map(async (environmentId) => {
      const query = server.usageSummary({
        environmentId,
        input: usageSummaryInput(input, registry.get(server.usageModelFilterAtom(environmentId))),
      });
      const presentation = presentations.presentationAtom(environmentId);
      const controller = new AbortController();
      const abortWhenDisconnected = () => {
        if (registry.get(presentation)?.connection.phase !== "connected") controller.abort();
      };
      const unsubscribe = registry.subscribe(presentation, abortWhenDisconnected);
      abortWhenDisconnected();
      try {
        const ratesResult = await runAtomCommand(
          registry,
          server.refreshUsageRates,
          { environmentId, input: {} },
          { reportFailure: false },
        );
        const sessionUnavailable =
          ratesResult._tag === "Failure" &&
          isEnvironmentRpcUnavailable(squashAtomCommandFailure(ratesResult));
        registry.refresh(query);
        if (sessionUnavailable || controller.signal.aborted) return;
        await executeAtomQuery(registry, query, {
          reportFailure: false,
          signal: controller.signal,
        });
      } finally {
        unsubscribe();
      }
    }),
  );
}
