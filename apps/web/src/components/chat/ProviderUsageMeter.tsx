import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ProviderInstanceId, ProviderUsageWindow } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { GaugeIcon } from "lucide-react";

import { providerUsageQuery } from "../../state/providerUsage";
import { cn } from "../../lib/utils";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

function formatReset(value: string | null | undefined): string | null {
  if (!value) return null;
  const resetAt = new Date(value);
  const remainingMs = resetAt.getTime() - Date.now();
  if (!Number.isFinite(remainingMs)) return null;
  if (remainingMs <= 0) return "Resetting soon";
  const hours = Math.ceil(remainingMs / 3_600_000);
  return hours < 24 ? `Resets in ${hours}h` : `Resets in ${Math.ceil(hours / 24)}d`;
}

function meterWindow(windows: readonly ProviderUsageWindow[]): ProviderUsageWindow | null {
  return (
    windows.find((window) => window.windowDurationMins === 10_080) ??
    windows.find((window) => window.id === "seven_day") ??
    windows[0] ??
    null
  );
}

function usageColor(usedPercent: number): string {
  if (usedPercent >= 90) return "var(--color-red-500)";
  if (usedPercent >= 75) return "var(--color-amber-500)";
  return "color-mix(in oklab, var(--color-primary) 82%, transparent)";
}

export function ProviderUsageMeter(props: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
}) {
  const result = useAtomValue(
    providerUsageQuery({ environmentId: props.environmentId, input: {} }),
  );
  if (!AsyncResult.isSuccess(result)) return null;

  const provider = result.value.providers.find(
    (candidate) => candidate.instanceId === props.instanceId && candidate.status === "available",
  );
  const activeWindow = provider ? meterWindow(provider.windows) : null;
  if (!provider || !activeWindow) return null;

  const usedPercent = Math.max(0, Math.min(100, activeWindow.usedPercent));
  const remainingPercent = Math.max(0, Math.min(100, activeWindow.remainingPercent));
  const color = usageColor(usedPercent);

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <button
            type="button"
            className="inline-flex size-6 cursor-pointer items-center justify-center rounded-full border border-transparent text-muted-foreground outline-none transition-colors hover:bg-accent data-[pressed]:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            aria-label={`${provider.displayName} plan usage: ${Math.round(remainingPercent)}% remaining`}
          >
            <GaugeIcon aria-hidden className="size-4" style={{ color }} />
          </button>
        }
      />
      <PopoverPopup
        tooltipStyle
        side="top"
        align="end"
        viewportClassName="p-0"
        className="w-64 max-w-none text-left whitespace-normal"
      >
        <div className="flex flex-col gap-3 p-[var(--floating-content-inset)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-muted-foreground text-xs">Plan usage</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground/65">
                {provider.displayName}
              </div>
            </div>
            {provider.plan ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                {provider.plan.replaceAll("_", " ")}
              </span>
            ) : null}
          </div>
          {provider.windows.map((window) => {
            const remaining = Math.max(0, Math.min(100, window.remainingPercent));
            const used = Math.max(0, Math.min(100, window.usedPercent));
            return (
              <div key={window.id} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-[11px]">
                  <span className="min-w-0 truncate text-muted-foreground">{window.label}</span>
                  <span className="shrink-0 font-medium tabular-nums text-muted-foreground/85">
                    {Math.round(remaining)}% left
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-muted/60"
                  role="progressbar"
                  aria-label={`${window.label} plan usage`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(used)}
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width,background-color] duration-500 motion-reduce:transition-none",
                    )}
                    style={{ width: `${used}%`, backgroundColor: usageColor(used) }}
                  />
                </div>
                {formatReset(window.resetsAt) ? (
                  <div className="text-[10px] text-muted-foreground/60">
                    {formatReset(window.resetsAt)}
                  </div>
                ) : null}
              </div>
            );
          })}
          <div className="text-[10px] text-muted-foreground/55">
            Updated{" "}
            {new Date(provider.updatedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
