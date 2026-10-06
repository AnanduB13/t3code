import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import { composerUsageWindowLabel, selectComposerUsageWindow } from "@t3tools/shared/usageLimits";

import { usageLimitProvidersAtom } from "../../state/providerUsage";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

function formatReset(value: string | null | undefined): string | null {
  if (!value) return null;
  const resetAt = new Date(value);
  const remainingMs = resetAt.getTime() - Date.now();
  if (!Number.isFinite(remainingMs)) return null;
  if (remainingMs <= 0) return "Resetting soon";
  const hours = Math.ceil(remainingMs / 3_600_000);
  return hours < 24 ? `Resets in ${hours}h` : `Resets in ${Math.ceil(hours / 24)}d`;
}

function usageColor(remainingPercent: number): string {
  if (remainingPercent <= 10) return "var(--color-red-500)";
  if (remainingPercent <= 25) return "var(--color-amber-500)";
  return "color-mix(in oklab, var(--color-primary) 82%, transparent)";
}

function compactPlanLabel(label: string): string {
  return label
    .replaceAll("_", " ")
    .trim()
    .replace(/\s+subscription$/i, "")
    .replace(/^(?:ChatGPT|Claude|Cursor)\s+/i, "")
    .replace(/\s+(\d+)x\b/gi, " · $1×");
}

function UsageGauge({ remainingPercent }: { readonly remainingPercent: number }) {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      style={{ color: usageColor(remainingPercent) }}
    >
      <path d="M 5.636 18.364 A 9 9 0 1 1 18.364 18.364" className="text-muted-foreground/25" />
      {remainingPercent > 0 ? (
        <path
          d="M 5.636 18.364 A 9 9 0 1 1 18.364 18.364"
          pathLength={100}
          strokeDasharray={`${remainingPercent} 100`}
        />
      ) : null}
      <path d="M 12 12 L 12 6" transform={`rotate(${-135 + remainingPercent * 2.7} 12 12)`} />
      <circle cx={12} cy={12} r={1.5} fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ProviderUsageMeter(props: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
}) {
  const providers = useAtomValue(usageLimitProvidersAtom(props.environmentId));
  const provider = providers.find((candidate) => candidate.instanceId === props.instanceId);
  const activeWindow = selectComposerUsageWindow(provider);
  if (!provider?.usageLimits || !activeWindow) return null;

  const remainingPercent = Math.max(0, Math.min(100, 100 - activeWindow.usedPercent));
  const displayName = provider.displayName?.trim() || String(provider.instanceId);
  const windowLabel = composerUsageWindowLabel(provider, activeWindow);
  const plan = provider.auth.label;

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
            aria-label={`${displayName} ${windowLabel.toLowerCase()} usage: ${Math.round(remainingPercent)}% remaining`}
          >
            <UsageGauge remainingPercent={remainingPercent} />
          </button>
        }
      />
      <PopoverPopup
        tooltipStyle
        side="top"
        align="end"
        padding="compact"
        width="sm"
        className="text-left whitespace-normal"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="shrink-0">
              <div className="whitespace-nowrap font-medium text-muted-foreground text-xs">
                {windowLabel} usage
              </div>
              <div className="mt-0.5 max-w-32 truncate text-2xs text-muted-foreground/65">
                {displayName}
              </div>
            </div>
            {plan ? (
              <Tooltip>
                <TooltipTrigger
                  aria-label={plan}
                  render={
                    <span
                      tabIndex={0}
                      className="min-w-0 max-w-24 truncate rounded-full bg-muted px-2 py-0.5 text-3xs font-medium capitalize text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  }
                >
                  {compactPlanLabel(plan)}
                </TooltipTrigger>
                <TooltipPopup side="top">{plan}</TooltipPopup>
              </Tooltip>
            ) : null}
          </div>
          {provider.usageLimits.windows.map((window) => {
            const remaining = Math.max(0, Math.min(100, 100 - window.usedPercent));
            const resetLabel = formatReset(window.resetsAt);
            return (
              <div key={window.id} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-2xs">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {window.id === activeWindow.id ? windowLabel : window.label}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-muted-foreground/85">
                    {Math.round(remaining)}% left
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-muted/60"
                  role="progressbar"
                  aria-label={`${window.label} usage remaining`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(remaining)}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${remaining}%`, backgroundColor: usageColor(remaining) }}
                  />
                </div>
                {resetLabel ? (
                  <div className="text-3xs text-muted-foreground/60">{resetLabel}</div>
                ) : null}
              </div>
            );
          })}
          {provider.usageLimits.unavailable ? (
            <div className="text-3xs text-muted-foreground/60">
              {provider.usageLimits.unavailable.message ??
                "Could not refresh usage. Showing last reported limits."}
            </div>
          ) : null}
          <div className="text-3xs text-muted-foreground/55">
            Updated{" "}
            {new Date(provider.usageLimits.checkedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
