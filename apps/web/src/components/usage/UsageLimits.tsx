import {
  type EnvironmentId,
  type ProviderConsumeResetCreditOutcome,
  ProviderConsumeResetCreditInput,
  ServerProvider,
  ServerProviderResetCredits,
  UsageProviderKind,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import { formatDuration, type LimitPace } from "@t3tools/shared/usageLimits";
import { GaugeIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { useState } from "react";

import { usageLimitsStateAtom } from "../../state/usageLimits";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { UsageLimitsPooled } from "./UsageLimitsPooled";
import { PROVIDER_PRESENTATION } from "./usageProviders";

const PACE: Record<LimitPace, { readonly label: string; readonly icon: typeof GaugeIcon }> = {
  ahead: { label: "Ahead of pace: spending faster than the window elapses", icon: TrendingUpIcon },
  on: { label: "On pace with the window", icon: GaugeIcon },
  under: { label: "Under pace: headroom left for the rest of the window", icon: TrendingDownIcon },
};

/** The series colour the cost chart uses for this driver, so the two views read as one. */
export function barColor(driver: ServerProvider["driver"]): string {
  const kind: UsageProviderKind | undefined =
    driver === "codex" ? "codex" : driver === "claudeAgent" ? "claude" : undefined;
  return kind ? PROVIDER_PRESENTATION[kind].color : "var(--foreground)";
}

/** Pace as a glyph with the words on hover. */
export function PaceIcon({ pace }: { readonly pace: LimitPace }) {
  const Icon = PACE[pace].icon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="img"
            aria-label={PACE[pace].label}
            className="inline-flex text-muted-foreground"
          />
        }
      >
        <Icon className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipPopup side="top">{PACE[pace].label}</TooltipPopup>
    </Tooltip>
  );
}

const OUTCOME_TEXT: Record<ProviderConsumeResetCreditOutcome, string> = {
  reset: "Reset applied. Your windows have cleared.",
  nothingToReset: "Nothing to reset right now.",
  noCredit: "No reset credit left.",
  alreadyRedeemed: "That credit was already redeemed.",
};

/** Everything a redeem needs: where to send it and what to say afterwards. */
export function useResetCredit(
  environmentId: EnvironmentId,
  input: ProviderConsumeResetCreditInput,
) {
  const consume = useAtomCommand(serverEnvironment.consumeResetCredit, { reportFailure: false });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const redeem = async () => {
    setConfirming(false);
    setBusy(true);
    setStatus(null);
    const result = await consume({ environmentId, input });
    setBusy(false);
    if (result._tag === "Success") {
      setStatus(result.value.warning ?? OUTCOME_TEXT[result.value.outcome]);
      return;
    }
    const error = Cause.squash(result.cause);
    setStatus(error instanceof Error ? error.message : "Could not use the reset credit.");
  };

  return { confirming, setConfirming, busy, status, redeem };
}

/**
 * The confirm for a redeem. Redeeming spends a credit the provider granted the
 * user, so it never fires on a bare click. Mount it outside any popover that
 * holds the button: dialogs stack under popovers, and closing the popover
 * would unmount a dialog rendered inside it.
 */
export function ResetCreditDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Use a reset credit?</AlertDialogTitle>
          <AlertDialogDescription>
            This redeems one credit on your account and clears the current rate-limit windows. It
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
          <Button onClick={onConfirm}>Use credit</Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

/** `2 reset credits banked · next expires in 27d 23h`, or the short form for a popover. */
export function resetCreditsSummary(
  credits: ServerProviderResetCredits,
  now: number,
  compact = false,
): string {
  const expiresIn = credits.nextExpiresAt
    ? formatDuration(Date.parse(credits.nextExpiresAt) - now)
    : null;
  if (credits.availableCount === 0) return "No reset credits banked";
  if (compact)
    return `${credits.availableCount} banked${expiresIn ? ` · expires in ${expiresIn}` : ""}`;
  return `${credits.availableCount} ${credits.availableCount === 1 ? "reset credit" : "reset credits"} banked${
    expiresIn ? ` · next expires in ${expiresIn}` : ""
  }`;
}

/**
 * Subscription quota across every connected environment's providers and hubs,
 * pooled per provider. The page advances `now` on explicit refresh rather than
 * ticking: a live clock would repaint the page for no decision-changing gain.
 */
export function UsageLimitsSection({
  selectedEnvironmentIds,
  now,
}: {
  readonly selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null;
  readonly now: number;
}) {
  const { presentations, pending } = useAtomValue(usageLimitsStateAtom);
  if (presentations.size === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect an environment to see account usage and reset times.
      </p>
    );
  }
  const selected =
    selectedEnvironmentIds === null
      ? presentations
      : new Map([...presentations].filter(([id]) => selectedEnvironmentIds.has(id)));
  return (
    <div className="space-y-4">
      {pending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading account limits…
        </p>
      ) : null}
      <UsageLimitsPooled presentations={selected} now={now} />
    </div>
  );
}
