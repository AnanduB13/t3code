import { useUser } from "@clerk/react";
import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { useMemo } from "react";
import {
  BarChart3Icon,
  FlameIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  ScanLineIcon,
} from "lucide-react";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { hasCloudPublicConfig } from "../../cloud/publicConfig";
import { useThreadShells } from "../../state/entities";
import { cn } from "../../lib/utils";
import { SettingsPageContainer } from "./settingsLayout";
import { deriveUsageStats } from "./usageStats";
import { primaryEnvironmentIdAtom } from "../../state/primaryEnvironment";
import { providerUsageQuery } from "../../state/providerUsage";

const EMPTY_USAGE_ATOM = Atom.make(
  AsyncResult.success({
    providers: [],
    tokenUsage: { lifetimeTokens: 0, peakThreadTokens: 0, trackedThreads: 0 },
  }),
).pipe(Atom.withLabel("provider-usage:empty"));

function formatReset(value: string | null | undefined) {
  if (!value) return "Reset time unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Reset time unavailable";
  return `Resets ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date)}`;
}

function formatTokens(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function UsageLimits() {
  const environmentId = useAtomValue(primaryEnvironmentIdAtom);
  const atom =
    environmentId === null ? EMPTY_USAGE_ATOM : providerUsageQuery({ environmentId, input: {} });
  const result = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);
  const providers = AsyncResult.isSuccess(result)
    ? result.value.providers.filter(
        (provider) => provider.provider === "codex" || provider.provider === "claudeAgent",
      )
    : [];
  const tokenUsage = AsyncResult.isSuccess(result) ? result.value.tokenUsage : null;
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Plan usage remaining</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Current provider quota windows; refreshed every five minutes
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={result.waiting}
          className="inline-flex size-8 items-center justify-center rounded-lg border bg-card text-muted-foreground transition hover:text-foreground disabled:opacity-50"
          aria-label="Refresh provider usage"
        >
          <RefreshCwIcon className={cn("size-3.5", result.waiting && "animate-spin")} />
        </button>
      </div>
      {tokenUsage ? (
        <div className="grid overflow-hidden rounded-2xl border bg-card shadow-sm sm:grid-cols-3">
          {[
            {
              label: "Lifetime tokens",
              value: formatTokens(tokenUsage.lifetimeTokens),
              title: tokenUsage.lifetimeTokens.toLocaleString(),
            },
            {
              label: "Peak chat",
              value: formatTokens(tokenUsage.peakThreadTokens),
              title: tokenUsage.peakThreadTokens.toLocaleString(),
            },
            {
              label: "Chats with token data",
              value: tokenUsage.trackedThreads.toLocaleString(),
              title: tokenUsage.trackedThreads.toLocaleString(),
            },
          ].map((metric) => (
            <div
              key={metric.label}
              title={metric.title}
              className="flex items-center gap-3 border-t border-border/60 px-4 py-4 first:border-t-0 sm:block sm:border-l sm:border-t-0 sm:first:border-l-0 sm:text-center"
            >
              <ScanLineIcon className="size-4 text-muted-foreground sm:mx-auto sm:mb-2" />
              <div className="text-lg font-semibold tabular-nums">{metric.value}</div>
              <div className="text-xs text-muted-foreground">{metric.label}</div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {result.waiting && providers.length === 0
          ? ["Codex", "Claude"].map((name) => (
              <div key={name} className="h-36 animate-pulse rounded-2xl border bg-card" />
            ))
          : providers.map((provider) => (
              <div key={provider.instanceId} className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-medium">{provider.displayName}</h3>
                    {provider.plan && (
                      <p className="text-xs capitalize text-muted-foreground">
                        {provider.plan.replaceAll("_", " ")}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-1 text-[10px] font-medium",
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
                    {provider.windows.map((window) => (
                      <div key={window.id}>
                        <div className="mb-1.5 flex items-baseline justify-between gap-3">
                          <span className="text-xs text-muted-foreground">{window.label}</span>
                          <span className="text-sm font-semibold tabular-nums">
                            {Math.round(window.remainingPercent)}% left
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full transition-[width]",
                              window.remainingPercent <= 10
                                ? "bg-destructive"
                                : window.remainingPercent <= 25
                                  ? "bg-amber-500"
                                  : "bg-primary",
                            )}
                            style={{ width: `${window.remainingPercent}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-[10px] text-muted-foreground">
                          {formatReset(window.resetsAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {provider.message ?? "No usage windows were reported for this account."}
                  </p>
                )}
              </div>
            ))}
        {!result.waiting && providers.length === 0 && (
          <div className="col-span-full rounded-2xl border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
            Connect Codex or Claude Code in Provider settings to see plan usage.
          </div>
        )}
      </div>
    </section>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "T3"
  );
}

function ProfileIdentity({
  name,
  subtitle,
  imageUrl,
}: {
  name: string;
  subtitle: string;
  imageUrl?: string;
}) {
  return (
    <div className="flex flex-col items-center py-2 text-center">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="size-20 rounded-full border border-border object-cover shadow-sm"
        />
      ) : (
        <div className="grid size-20 place-items-center rounded-full bg-primary text-xl font-semibold text-primary-foreground shadow-sm">
          {initials(name)}
        </div>
      )}
      <h1 className="mt-4 text-xl font-semibold tracking-tight">{name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function LocalIdentity() {
  return (
    <ProfileIdentity name="Local profile" subtitle="Usage across your connected environments" />
  );
}

function ConnectedIdentity() {
  const { isLoaded, user } = useUser();
  if (!isLoaded || !user) return <LocalIdentity />;
  const name = user.fullName ?? user.username ?? "T3 Code user";
  const subtitle = user.username
    ? `@${user.username}`
    : (user.primaryEmailAddress?.emailAddress ?? "T3 Connect");
  return <ProfileIdentity name={name} subtitle={subtitle} imageUrl={user.imageUrl} />;
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function ActivityGrid({ days }: { days: ReturnType<typeof deriveUsageStats>["days"] }) {
  const max = Math.max(1, ...days.map((day) => day.count));
  const months = [...new Set(days.map((day) => day.date.slice(0, 7)))];
  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="grid min-w-[680px] grid-flow-col grid-rows-7 gap-1"
        aria-label="Conversation activity during the last year"
      >
        {days.map((day) => {
          const level = day.count === 0 ? 0 : Math.max(1, Math.ceil((day.count / max) * 4));
          const label = `${formatDay(day.date)}: ${day.count} ${day.count === 1 ? "chat" : "chats"}`;
          return (
            <div
              key={day.date}
              title={label}
              aria-label={label}
              className={cn(
                "aspect-square min-w-2.5 rounded-[3px]",
                level === 0 && "bg-muted/70",
                level === 1 && "bg-primary/25",
                level === 2 && "bg-primary/45",
                level === 3 && "bg-primary/70",
                level === 4 && "bg-primary",
              )}
            />
          );
        })}
      </div>
      <div className="mt-2 flex min-w-[680px] justify-between text-[10px] text-muted-foreground/70">
        {months.map((month) => (
          <span key={month}>
            {new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" }).format(
              new Date(`${month}-01T00:00:00Z`),
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ProfileSettingsPanel() {
  const threads = useThreadShells();
  const stats = useMemo(() => deriveUsageStats(threads), [threads]);
  const metrics = [
    { label: "Total chats", value: stats.totalChats.toLocaleString(), icon: MessageSquareIcon },
    { label: "Active days", value: stats.activeDays.toLocaleString(), icon: BarChart3Icon },
    { label: "Current streak", value: `${stats.currentStreak}d`, icon: FlameIcon },
    { label: "Longest streak", value: `${stats.longestStreak}d`, icon: FlameIcon },
  ];
  return (
    <SettingsPageContainer className="max-w-5xl gap-7">
      {hasCloudPublicConfig() ? <ConnectedIdentity /> : <LocalIdentity />}
      <div className="grid overflow-hidden rounded-2xl border bg-card shadow-sm sm:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="flex items-center gap-3 border-t border-border/60 px-4 py-4 first:border-t-0 sm:block sm:border-l sm:border-t-0 sm:first:border-l-0 sm:text-center"
          >
            <Icon className="size-4 text-muted-foreground sm:mx-auto sm:mb-2" />
            <div className="text-lg font-semibold tabular-nums">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      <UsageLimits />
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Activity</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Chats started during the last 52 weeks
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <ActivityGrid days={stats.days} />
        </div>
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Activity insights</h2>
          <div className="rounded-2xl border bg-card px-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-border/60 py-3 text-sm">
              <span className="text-muted-foreground">Busiest day</span>
              <span className="font-medium">
                {stats.busiestDay
                  ? `${formatDay(stats.busiestDay.date)} · ${stats.busiestDay.count}`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between py-3 text-sm">
              <span className="text-muted-foreground">Average per active day</span>
              <span className="font-medium tabular-nums">
                {stats.activeDays === 0 ? "—" : (stats.totalChats / stats.activeDays).toFixed(1)}
              </span>
            </div>
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Provider usage</h2>
          <div className="rounded-2xl border bg-card px-4 shadow-sm">
            {stats.providers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Provider usage will appear after your first chat.
              </p>
            ) : (
              stats.providers.slice(0, 5).map((provider) => (
                <div
                  key={provider.provider}
                  className="border-b border-border/60 py-3 last:border-b-0"
                >
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span>{provider.provider}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {provider.count} · {provider.percentage}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${provider.percentage}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </SettingsPageContainer>
  );
}
