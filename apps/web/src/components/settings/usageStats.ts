import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

export interface UsageDay {
  readonly date: string;
  readonly count: number;
}

export interface ProviderUsage {
  readonly provider: string;
  readonly count: number;
  readonly percentage: number;
}

export interface UsageStats {
  readonly totalChats: number;
  readonly activeDays: number;
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly busiestDay: UsageDay | null;
  readonly days: ReadonlyArray<UsageDay>;
  readonly providers: ReadonlyArray<ProviderUsage>;
}

const DAY_MS = 86_400_000;

function dateKey(value: string | number | Date): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

function providerLabel(provider: string): string {
  return provider.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function deriveUsageStats(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  now: Date = new Date(),
): UsageStats {
  const counts = new Map<string, number>();
  const providerCounts = new Map<string, number>();

  for (const thread of threads) {
    const day = dateKey(thread.createdAt);
    if (day) counts.set(day, (counts.get(day) ?? 0) + 1);

    const provider = String(thread.modelSelection.instanceId);
    providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1);
  }

  const today = new Date(`${dateKey(now)}T00:00:00.000Z`);
  const start = new Date(today.getTime() - 363 * DAY_MS);
  const days = Array.from({ length: 364 }, (_, index) => {
    const date = dateKey(start.getTime() + index * DAY_MS);
    return { date, count: counts.get(date) ?? 0 };
  });

  const activeDates = [...counts.keys()].toSorted();
  let longestStreak = 0;
  let runningStreak = 0;
  let previousTime: number | null = null;
  for (const date of activeDates) {
    const time = new Date(`${date}T00:00:00.000Z`).getTime();
    runningStreak = previousTime !== null && time - previousTime === DAY_MS ? runningStreak + 1 : 1;
    longestStreak = Math.max(longestStreak, runningStreak);
    previousTime = time;
  }

  let currentStreak = 0;
  const todayTime = today.getTime();
  const latestTime = previousTime;
  if (latestTime !== null && todayTime - latestTime <= DAY_MS) {
    const activeSet = new Set(activeDates);
    for (let time = latestTime; activeSet.has(dateKey(time)); time -= DAY_MS) currentStreak += 1;
  }

  const busiestDay = [...counts.entries()].reduce<UsageDay | null>(
    (best, [date, count]) => (best === null || count > best.count ? { date, count } : best),
    null,
  );
  const totalChats = threads.length;
  const providers = [...providerCounts.entries()]
    .map(([provider, count]) => ({
      provider: providerLabel(provider),
      count,
      percentage: totalChats === 0 ? 0 : Math.round((count / totalChats) * 100),
    }))
    .toSorted(
      (left, right) => right.count - left.count || left.provider.localeCompare(right.provider),
    );

  return {
    totalChats,
    activeDays: counts.size,
    currentStreak,
    longestStreak,
    busiestDay,
    days,
    providers,
  };
}
