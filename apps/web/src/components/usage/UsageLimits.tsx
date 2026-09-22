import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { ProviderUsageSnapshot } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect } from "react";

import { cn } from "../../lib/utils";
import { providerUsageQuery } from "../../state/providerUsage";
import type { EnvironmentUsageStatus } from "../../state/usage";

function formatReset(value: string | null | undefined): string {
  if (!value) return "Reset time unavailable";
  const resetAt = new Date(value);
  const remainingMs = resetAt.getTime() - Date.now();
  if (!Number.isFinite(remainingMs)) return "Reset time unavailable";
  if (remainingMs <= 0) return "Resetting soon";

  const totalHours = Math.ceil(remainingMs / 3_600_000);
  const relative =
    totalHours < 24
      ? `${totalHours}h`
      : `${Math.floor(totalHours / 24)}d${totalHours % 24 === 0 ? "" : ` ${totalHours % 24}h`}`;
  const exact = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(resetAt);
  return `Resets in ${relative} · ${exact}`;
}

function ProviderLimitCard({ provider }: { readonly provider: ProviderUsageSnapshot }) {
  return (
    <article className="border border-border bg-background p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-foreground">{provider.displayName}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {provider.plan ? provider.plan.replaceAll("_", " ") : "Subscription account"}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
            provider.status === "available"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          {provider.status === "available" ? "Live" : "Unavailable"}
        </span>
      </div>

      {provider.windows.length > 0 ? (
        <div className="space-y-4">
          {provider.windows.map((window) => {
            const remaining = Math.max(0, Math.min(100, window.remainingPercent));
            return (
              <div key={window.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {window.label}
                  </span>
                  <span className="shrink-0 text-sm font-medium text-foreground tabular-nums">
                    {Math.round(remaining)}% left
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={`${window.label} remaining`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(remaining)}
                >
                  <div
                    className={cn(
                      "h-full rounded-full",
                      remaining <= 10
                        ? "bg-destructive"
                        : remaining <= 25
                          ? "bg-amber-500"
                          : "bg-primary",
                    )}
                    style={{ width: `${remaining}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  {formatReset(window.resetsAt)}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {provider.message ?? "No usage windows were reported for this account."}
        </p>
      )}
    </article>
  );
}

function EnvironmentLimits({
  environment,
  refreshSignal,
}: {
  readonly environment: EnvironmentUsageStatus;
  readonly refreshSignal: number;
}) {
  const atom = providerUsageQuery({ environmentId: environment.environmentId, input: {} });
  const result = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);

  useEffect(() => {
    if (refreshSignal > 0) refresh();
  }, [refresh, refreshSignal]);

  const providers = AsyncResult.isSuccess(result)
    ? result.value.providers.filter((provider) => provider.status !== "unsupported")
    : [];
  const latestUpdate = providers.reduce(
    (latest, provider) => Math.max(latest, Date.parse(provider.updatedAt)),
    0,
  );

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <h3 className="text-sm font-medium text-foreground">{environment.label}</h3>
        {latestUpdate > 0 ? (
          <span className="text-[10px] text-muted-foreground">
            Updated{" "}
            {new Date(latestUpdate).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        ) : null}
      </div>

      {result.waiting && providers.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-36 rounded-md border border-border bg-muted/40" />
          <div className="h-36 rounded-md border border-border bg-muted/40" />
        </div>
      ) : providers.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {providers.map((provider) => (
            <ProviderLimitCard key={provider.instanceId} provider={provider} />
          ))}
        </div>
      ) : (
        <div className="border border-border px-5 py-8 text-center text-sm text-muted-foreground">
          {AsyncResult.isSuccess(result)
            ? "No account usage is available on this environment."
            : "This environment could not report account usage."}
        </div>
      )}
    </section>
  );
}

export function UsageLimitsSection({
  environments,
  refreshSignal,
}: {
  readonly environments: readonly EnvironmentUsageStatus[];
  readonly refreshSignal: number;
}) {
  if (environments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect an environment to see account usage and reset times.
      </p>
    );
  }

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-sm font-medium text-foreground">Account usage</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Subscription quota remaining for provider accounts on each environment.
        </p>
      </div>
      {environments.map((environment) => (
        <EnvironmentLimits
          key={environment.environmentId}
          environment={environment}
          refreshSignal={refreshSignal}
        />
      ))}
    </div>
  );
}
