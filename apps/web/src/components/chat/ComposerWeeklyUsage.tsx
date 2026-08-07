import { useAtomValue } from "@effect/atom-react";
import type {
  EnvironmentId,
  ProviderInstanceId,
  ProviderUsageSnapshot,
  ProviderUsageWindow,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { Clock3Icon } from "lucide-react";

import { providerUsageQuery } from "../../state/providerUsage";
import { cn } from "../../lib/utils";

export function selectWeeklyUsageWindow(
  provider: ProviderUsageSnapshot | undefined,
): ProviderUsageWindow | null {
  if (!provider || provider.status !== "available") return null;
  return (
    provider.windows.find((window) => window.windowDurationMins === 10_080) ??
    provider.windows.find((window) => window.id === "seven_day") ??
    provider.windows.find((window) => window.label.trim().toLowerCase() === "weekly") ??
    null
  );
}

export function formatWeeklyUsageReset(
  resetsAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!resetsAt) return null;
  const reset = new Date(resetsAt);
  const remainingMs = reset.getTime() - now.getTime();
  if (!Number.isFinite(remainingMs)) return null;
  if (remainingMs <= 0) return "resetting soon";
  const hours = Math.ceil(remainingMs / 3_600_000);
  if (hours < 24) return `resets in ${hours}h`;
  const days = Math.floor(hours / 24);
  const remainderHours = hours % 24;
  return remainderHours === 0 ? `resets in ${days}d` : `resets in ${days}d ${remainderHours}h`;
}

export function ComposerWeeklyUsage(props: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly compact: boolean;
}) {
  const result = useAtomValue(
    providerUsageQuery({ environmentId: props.environmentId, input: {} }),
  );
  if (!AsyncResult.isSuccess(result)) return null;

  const provider = result.value.providers.find(
    (candidate) => candidate.instanceId === props.instanceId,
  );
  const weekly = selectWeeklyUsageWindow(provider);
  if (!provider || !weekly) return null;

  const remaining = Math.round(weekly.remainingPercent);
  const resetLabel = formatWeeklyUsageReset(weekly.resetsAt);
  const barTone =
    remaining <= 10 ? "bg-destructive" : remaining <= 25 ? "bg-amber-500" : "bg-primary/80";

  return (
    <div
      className="border-t border-border/45 px-3 py-2 sm:px-4"
      data-chat-composer-weekly-usage="true"
      title={`${provider.displayName} weekly usage: ${remaining}% remaining${resetLabel ? `, ${resetLabel}` : ""}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex min-w-0 shrink-0 items-center gap-1.5 text-[10px] font-medium text-muted-foreground/80">
          <span className="size-1.5 rounded-full bg-primary/70" aria-hidden="true" />
          <span className={cn("truncate", props.compact && "max-w-16")}>
            {provider.displayName}
          </span>
          <span className="text-muted-foreground/50">weekly</span>
        </div>
        <div
          className="h-1 min-w-10 flex-1 overflow-hidden rounded-full bg-muted/80"
          role="progressbar"
          aria-label={`${provider.displayName} weekly usage remaining`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={remaining}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-500", barTone)}
            style={{ width: `${weekly.remainingPercent}%` }}
          />
        </div>
        <span className="shrink-0 text-[10px] font-semibold tabular-nums text-foreground/75">
          {remaining}% left
        </span>
        {!props.compact && resetLabel ? (
          <span className="hidden shrink-0 items-center gap-1 text-[10px] text-muted-foreground/60 sm:flex">
            <Clock3Icon className="size-2.5" />
            {resetLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
