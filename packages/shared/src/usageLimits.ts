/**
 * Selection and pace maths for the provider limits view, shared by web and
 * mobile so both agree on which providers show, what "ahead of pace" means,
 * and how a reset is phrased.
 *
 * @module usageLimits
 */
import {
  type EnvironmentId,
  type ProviderConsumeResetCreditInput,
  type ProviderUsageSnapshot,
  isProviderAvailable,
  type ServerProvider,
  type ServerProviderUsageLimits,
  type ServerProviderUsageWindow,
  type UsageLimitSourceSnapshots,
} from "@t3tools/contracts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Providers that belong on the Limits view: enabled, installed, and one whose
 * driver reports subscription usage at all. A driver with no notion of usage
 * never sets `usageLimits`, so it has no row rather than an empty one.
 */
export function providersWithLimits(
  providers: readonly ServerProvider[],
): readonly ServerProvider[] {
  return providers.filter(
    (provider) =>
      provider.enabled &&
      provider.installed &&
      isProviderAvailable(provider) &&
      provider.usageLimits !== undefined,
  );
}

export type LimitPresentations = ReadonlyMap<
  EnvironmentId,
  {
    readonly entry: { readonly target: { readonly label: string } };
    readonly serverConfig: {
      readonly providers?: readonly ServerProvider[] | undefined;
      readonly usageLimitSources?: UsageLimitSourceSnapshots | undefined;
    } | null;
  }
>;

function accountKey(driver: ServerProvider["driver"], email: string | undefined): string | null {
  const normalizedEmail = email?.trim().toLowerCase();
  return normalizedEmail ? `${driver}:${normalizedEmail}` : null;
}

/**
 * One subscription account as the pooled views see it, whichever way it was
 * reported. The same email signed in natively on two environments, or reported
 * by a hub as well as natively, is one account: its quota is one bucket, so
 * counting it twice would misstate what is left.
 */
export interface LimitAccount {
  readonly key: string;
  readonly driver: ServerProvider["driver"];
  /** The instance's configured name, which is not sensitive; null for hub accounts. */
  readonly displayName: string | null;
  readonly email: string | undefined;
  readonly plan: string | undefined;
  readonly accentColor: string | undefined;
  /** Environments the account is signed in on; empty when only a hub reports it. */
  readonly environments: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly label: string;
  }>;
  /** The hub that reported it, when no environment has it natively. */
  readonly sourceLabel: string | null;
  /** Where the displayed reset credit can be redeemed. */
  readonly redeem: {
    readonly environmentId: EnvironmentId;
    readonly input: ProviderConsumeResetCreditInput;
  } | null;
  readonly limits: ServerProviderUsageLimits;
}

/**
 * Every account with usable windows across the connected environments, one
 * entry per distinct account. The freshest reads supply windows and credits;
 * native instances supply names and environment labels.
 */
export function collectLimitAccounts(presentations: LimitPresentations): readonly LimitAccount[] {
  const accounts = new Map<string, LimitAccount>();
  const creditSources = new Map<string, LimitAccount>();
  const hubRedeems = new Map<string, LimitAccount>();
  const merge = (key: string, next: LimitAccount) => {
    // Redeeming through a hub also clears the routing cooldown that hub holds
    // for the account. Redeeming natively against the same subscription resets
    // it upstream but leaves the hub refusing to route to the account until
    // its own cooldown expires, so a hub target wins the redemption outright
    // while the displayed balance still follows the freshest read.
    const previousHub = hubRedeems.get(key);
    if (
      next.redeem &&
      "sourceId" in next.redeem.input &&
      (!previousHub || Date.parse(next.limits.checkedAt) > Date.parse(previousHub.limits.checkedAt))
    ) {
      hubRedeems.set(key, next);
    }
    const previousCredit = creditSources.get(key);
    if (
      next.limits.resetCredits &&
      (!previousCredit ||
        Date.parse(next.limits.checkedAt) > Date.parse(previousCredit.limits.checkedAt))
    ) {
      creditSources.set(key, next);
    }
    const previous = accounts.get(key);
    if (!previous) {
      accounts.set(key, next);
      return;
    }
    const fresher = Date.parse(next.limits.checkedAt) > Date.parse(previous.limits.checkedAt);
    // Two instances on one machine sharing an account still name it once.
    const environments = [
      ...previous.environments,
      ...next.environments.filter(
        (candidate) =>
          !previous.environments.some((seen) => seen.environmentId === candidate.environmentId),
      ),
    ];
    const winner = fresher ? next : previous;
    // Credits and their redemption target travel together. A failed credit
    // probe must not erase a successful read from another environment.
    const creditSource = creditSources.get(key);
    accounts.set(key, {
      ...previous,
      displayName: previous.displayName ?? next.displayName,
      plan: previous.plan ?? next.plan,
      accentColor: previous.accentColor ?? next.accentColor,
      environments,
      // A hub only names the account when no environment has it natively.
      sourceLabel: environments.length > 0 ? null : (previous.sourceLabel ?? next.sourceLabel),
      redeem:
        hubRedeems.get(key)?.redeem ??
        (creditSource ? creditSource.redeem : (winner.redeem ?? previous.redeem ?? next.redeem)),
      limits: {
        ...winner.limits,
        ...(creditSource?.limits.resetCredits
          ? { resetCredits: creditSource.limits.resetCredits }
          : { resetCredits: undefined }),
      },
    });
  };
  for (const [environmentId, presentation] of presentations) {
    const label = presentation.entry.target.label;
    for (const provider of providersWithLimits(presentation.serverConfig?.providers ?? [])) {
      if (!provider.usageLimits || limitsNotice(provider.usageLimits) !== null) continue;
      merge(
        accountKey(provider.driver, provider.auth.email) ??
          `${environmentId}:${provider.instanceId}`,
        {
          key: `${environmentId}:${provider.instanceId}`,
          driver: provider.driver,
          displayName: provider.displayName?.trim() || null,
          email: provider.auth.email,
          plan: provider.auth.label,
          accentColor: provider.accentColor,
          environments: [{ environmentId, label }],
          sourceLabel: null,
          redeem: { environmentId, input: { instanceId: provider.instanceId } },
          limits: provider.usageLimits,
        },
      );
    }
  }
  // Every hub account, including those a native instance also knows: the hub
  // may hold a fresher read of the same subscription, and the merge above
  // keeps the redeem target consistent with whichever snapshot wins.
  const labelEnvironment = presentations.size > 1;
  for (const [environmentId, presentation] of presentations) {
    for (const source of presentation.serverConfig?.usageLimitSources ?? []) {
      const sourceLabel = labelEnvironment
        ? `${presentation.entry.target.label} · ${source.label}`
        : source.label;
      for (const account of source.accounts) {
        if (limitsNotice(account.usageLimits) !== null) continue;
        merge(accountKey(account.driver, account.email) ?? `${source.id}:${account.id}`, {
          key: `${source.id}:${account.id}`,
          driver: account.driver,
          displayName: account.email ? null : account.id.replace(/\.json$/i, ""),
          email: account.email,
          plan: account.plan,
          accentColor: undefined,
          environments: [],
          sourceLabel,
          redeem: account.usageLimits.resetCredits?.nextCreditId
            ? {
                environmentId,
                input: {
                  sourceId: source.id,
                  accountId: account.id,
                  creditId: account.usageLimits.resetCredits.nextCreditId,
                },
              }
            : null,
          limits: account.usageLimits,
        });
      }
    }
  }
  return [...accounts.values()];
}

/**
 * What the pooled views cannot draw as a bar: a hub that failed to read, a
 * provider whose probe failed. Accounts that can never report (API keys)
 * are left out; there is nothing for the user to act on. The environment
 * is named only when more than one is connected.
 */
export function collectLimitNotices(presentations: LimitPresentations): readonly string[] {
  const label = (environmentLabel: string, subject: string) =>
    presentations.size > 1 ? `${environmentLabel} · ${subject}` : subject;
  const notices: string[] = [];
  for (const presentation of presentations.values()) {
    const environmentLabel = presentation.entry.target.label;
    for (const provider of providersWithLimits(presentation.serverConfig?.providers ?? [])) {
      // An account that can never report (API key) is left out; one that
      // failed, or reported nothing at all, is worth a line.
      if (provider.usageLimits?.unavailable?.reason === "unsupported") continue;
      const notice = provider.usageLimits ? limitsNotice(provider.usageLimits) : null;
      const name = provider.displayName?.trim() || String(provider.driver);
      if (notice) notices.push(`${label(environmentLabel, name)}: ${notice}`);
    }
    for (const source of presentation.serverConfig?.usageLimitSources ?? []) {
      if (source.error) {
        notices.push(`${label(environmentLabel, source.label)}: ${source.error}`);
      } else if (source.accounts.length === 0) {
        notices.push(`${label(environmentLabel, source.label)}: No accounts reported.`);
      }
    }
  }
  return notices;
}

export interface LimitPoolMember {
  readonly account: LimitAccount;
  readonly window: ServerProviderUsageWindow;
}

/**
 * One window id across every account that reports it: the pooled share left,
 * pace against the clock, and the resets in the order they will land, each
 * with the share of the pool it hands back.
 */
export interface LimitPoolWindow {
  readonly id: string;
  readonly kind: ServerProviderUsageWindow["kind"];
  readonly label: string;
  readonly members: readonly LimitPoolMember[];
  /** Fixed account positions across rows; a null window leaves a gap. */
  readonly columns: ReadonlyArray<{
    readonly account: LimitAccount;
    readonly window: ServerProviderUsageWindow | null;
  }>;
  readonly remainingPercent: number;
  readonly usedPercent: number;
  readonly pace: LimitPace | null;
  readonly resets: ReadonlyArray<{
    readonly member: LimitPoolMember;
    readonly at: number;
    /** Points of the pool the reset restores: the member's used share over the member count. */
    readonly restoresPercent: number;
  }>;
}

export interface LimitPool {
  readonly driver: ServerProvider["driver"];
  readonly accounts: readonly LimitAccount[];
  readonly windows: readonly LimitPoolWindow[];
}

const WINDOW_KIND_ORDER: Record<ServerProviderUsageWindow["kind"], number> = {
  session: 0,
  weekly: 1,
  monthly: 2,
  other: 3,
};

/**
 * Accounts grouped by driver, each with its windows pooled by kind and id.
 * Window ids are stable per provider, so a hub row and a native row for the
 * same window land in the same pool; the kind is part of the key because
 * Codex's `primary` is a position, not a duration (five hours on paid plans,
 * a month on Free/Go), and a monthly allowance must not average into a
 * five-hour pool. Pools order by kind, then first appearance.
 *
 * Accounts and columns share the session reset order, soonest first. When
 * no account reports a session window, use the first window by kind instead.
 * Missing reset times sort last, with account names and keys breaking ties.
 * Each window's reset list still follows its own clock.
 */
export function collectLimitPools(
  accounts: readonly LimitAccount[],
  now: number,
): readonly LimitPool[] {
  const byDriver = new Map<ServerProvider["driver"], LimitAccount[]>();
  for (const account of accounts) {
    const list = byDriver.get(account.driver);
    if (list) list.push(account);
    else byDriver.set(account.driver, [account]);
  }
  return [...byDriver].map(([driver, members]) => {
    const orderWindow = members
      .flatMap((account) => account.limits.windows)
      .sort((left, right) => WINDOW_KIND_ORDER[left.kind] - WINDOW_KIND_ORDER[right.kind])[0];
    const orderReset = (account: LimitAccount) => {
      const window = account.limits.windows.find(
        (window) => window.kind === orderWindow?.kind && window.id === orderWindow.id,
      );
      return (window ? resetMillis(window) : null) ?? Number.POSITIVE_INFINITY;
    };
    const sorted = [...members].sort(
      (left, right) =>
        orderReset(left) - orderReset(right) ||
        accountSortName(left).localeCompare(accountSortName(right)) ||
        left.key.localeCompare(right.key),
    );
    return { driver, accounts: sorted, windows: poolWindows(sorted, now) };
  });
}

function accountSortName(account: LimitAccount): string {
  return (account.displayName ?? account.email ?? account.key).toLowerCase();
}

function poolWindows(accounts: readonly LimitAccount[], now: number): readonly LimitPoolWindow[] {
  const byKey = new Map<string, LimitPoolMember[]>();
  for (const account of accounts) {
    for (const window of account.limits.windows) {
      const key = `${window.kind}:${window.id}`;
      const list = byKey.get(key);
      if (list) list.push({ account, window });
      else byKey.set(key, [{ account, window }]);
    }
  }
  const pools = [...byKey.values()].map((members): LimitPoolWindow => {
    const memberByAccount = new Map(members.map((member) => [member.account.key, member]));
    const first = members[0]!.window;
    const usedPercent = members.reduce((sum, m) => sum + m.window.usedPercent, 0) / members.length;
    // Pace compares spend against the clock, so it is judged only over the
    // members that have a clock; a window with no reset would otherwise
    // count as spend with no time elapsed and skew the verdict.
    const timed = members.flatMap((m) => {
      const share = elapsedShare(m.window, now);
      return share === null ? [] : [{ used: m.window.usedPercent, elapsed: share }];
    });
    const timedUsed = timed.reduce((sum, t) => sum + t.used, 0) / timed.length;
    const meanElapsed =
      timed.length > 0 ? timed.reduce((sum, t) => sum + t.elapsed, 0) / timed.length : null;
    const resets = members
      .flatMap((member) => {
        const at = resetMillis(member.window);
        return at === null
          ? []
          : [
              {
                member,
                at,
                restoresPercent: Math.round(member.window.usedPercent / members.length),
              },
            ];
      })
      .sort((left, right) => left.at - right.at);
    return {
      id: first.id,
      kind: first.kind,
      label: first.label,
      members,
      columns: accounts.map(
        (account) => memberByAccount.get(account.key) ?? { account, window: null },
      ),
      usedPercent: Math.round(usedPercent),
      remainingPercent: Math.round(100 - usedPercent),
      pace: meanElapsed === null ? null : paceOfShares(timedUsed, meanElapsed),
      resets,
    };
  });
  return pools.sort((left, right) => WINDOW_KIND_ORDER[left.kind] - WINDOW_KIND_ORDER[right.kind]);
}

/** The one-line status under a provider heading when there are no bars to draw. */
export function limitsNotice(limits: ServerProviderUsageLimits): string | null {
  if (limits.unavailable?.reason === "unsupported") {
    return limits.unavailable.message ?? "This account has no subscription limits.";
  }
  if (limits.unavailable?.reason === "probeFailed") {
    return limits.unavailable.message ?? "Could not read limits.";
  }
  return limits.windows.length === 0 ? "No limits reported." : null;
}

/** Quota left in the window, 0..100. Bars and labels show what remains, as Codex does. */
export function remainingPercent(window: ServerProviderUsageWindow): number {
  return Math.round(100 - Math.max(0, Math.min(100, window.usedPercent)));
}

function resetMillis(window: ServerProviderUsageWindow): number | null {
  if (window.resetsAt === undefined) return null;
  const at = Date.parse(window.resetsAt);
  return Number.isFinite(at) ? at : null;
}

/** Elapsed share of the window, 0..1, or null when its length or reset is unknown. */
export function elapsedShare(window: ServerProviderUsageWindow, now: number): number | null {
  const resetsAt = resetMillis(window);
  if (resetsAt === null || window.windowDurationMins === undefined) return null;
  const length = window.windowDurationMins * MINUTE;
  if (length <= 0) return null;
  return Math.max(0, Math.min(1, (length - (resetsAt - now)) / length));
}

export type LimitPace = "ahead" | "on" | "under";

/**
 * Usage against the clock. Spending evenly leaves the same share of quota as
 * there is time left in the window; within five points of that counts as on
 * pace, further ahead means the window may run dry first.
 */
export function paceOf(window: ServerProviderUsageWindow, now: number): LimitPace | null {
  const elapsed = elapsedShare(window, now);
  return elapsed === null ? null : paceOfShares(window.usedPercent, elapsed);
}

function paceOfShares(usedPercent: number, elapsed: number): LimitPace {
  const gap = usedPercent - elapsed * 100;
  if (gap > 5) return "ahead";
  if (gap < -5) return "under";
  return "on";
}

/** `2h 13m`, `3d 4h`, `12m`. */
export function formatDuration(ms: number): string {
  const remaining = Math.max(0, ms);
  const days = Math.floor(remaining / DAY);
  const hours = Math.floor((remaining % DAY) / HOUR);
  const minutes = Math.floor((remaining % HOUR) / MINUTE);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** `resets in 2h 13m`, or null when the window has no reset. */
export function formatResetsIn(window: ServerProviderUsageWindow, now: number): string | null {
  const resetsAt = resetMillis(window);
  if (resetsAt === null) return null;
  return resetsAt <= now ? "resets now" : `resets in ${formatDuration(resetsAt - now)}`;
}

/** Older environments report windows through a separate RPC, without reset credits. */
export function withLegacyUsageLimits(
  providers: readonly ServerProvider[],
  snapshots: readonly ProviderUsageSnapshot[],
): ServerProvider[] {
  return providers.map((provider) => {
    if (provider.usageLimits) return provider;
    const snapshot = snapshots.find((item) => item.instanceId === provider.instanceId);
    if (!snapshot) return provider;
    return {
      ...provider,
      auth: { ...provider.auth, label: snapshot.plan ?? provider.auth.label },
      usageLimits: {
        checkedAt: snapshot.updatedAt,
        windows: snapshot.windows.map((window) => ({
          id: window.id,
          kind: legacyWindowKind(window),
          label: window.label,
          usedPercent: Math.max(0, Math.min(100, window.usedPercent)),
          ...(window.resetsAt ? { resetsAt: window.resetsAt } : {}),
          ...(window.windowDurationMins === undefined
            ? {}
            : { windowDurationMins: window.windowDurationMins }),
        })),
        ...(snapshot.status === "available"
          ? {}
          : {
              unavailable: {
                reason:
                  snapshot.status === "unsupported"
                    ? ("unsupported" as const)
                    : ("probeFailed" as const),
                ...(snapshot.message ? { message: snapshot.message } : {}),
              },
            }),
      },
    };
  });
}

function legacyWindowKind(
  window: ProviderUsageSnapshot["windows"][number],
): ServerProviderUsageWindow["kind"] {
  if (window.windowDurationMins === 300 || window.id === "primary" || window.id === "five_hour")
    return "session";
  if (
    window.windowDurationMins === 10_080 ||
    window.id === "secondary" ||
    window.id.startsWith("seven_day")
  )
    return "weekly";
  if (window.windowDurationMins === 43_200) return "monthly";
  return "other";
}
