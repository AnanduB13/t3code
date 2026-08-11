import type { DiscoveredLocalServer, ScopedThreadRef, VcsStatusResult } from "@t3tools/contracts";
import type { ElementType } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  FileDiffIcon,
  FolderGit2Icon,
  GitBranchIcon,
  GitCommitIcon,
  GitPullRequestIcon,
  LaptopIcon,
  ListTreeIcon,
  RadioTowerIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "../ui/button";
import { resolveDiscoveredServerUrl } from "~/browser/browserTargetResolver";
import { cn } from "~/lib/utils";
import { useDiscoveredPorts } from "~/portDiscoveryState";

export function resolveEnvironmentSyncLabel(
  status: Pick<VcsStatusResult, "hasUpstream" | "aheadCount" | "behindCount"> | null,
) {
  if (status === null) return "Status unavailable";
  if (!status.hasUpstream) return "No upstream";
  if (status.aheadCount === 0 && status.behindCount === 0) return "Up to date";
  if (status.aheadCount > 0 && status.behindCount > 0) {
    return `${status.aheadCount} ahead, ${status.behindCount} behind`;
  }
  if (status.aheadCount > 0) return `${status.aheadCount} ahead`;
  return `${status.behindCount} behind`;
}

interface EnvironmentSummaryPopoverProps {
  threadRef: ScopedThreadRef | null;
  status: VcsStatusResult | null;
  workspaceLabel: string;
  workspaceDetail: string | null;
  providerName: string;
  ProviderIcon: ElementType<{ className?: string }>;
  quickActionLabel: string;
  quickActionDisabled: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenChanges: () => void;
  onRunQuickAction: () => void;
  onOpenPullRequest: () => void;
}

export function resolveEnvironmentHostPresentation(
  server: DiscoveredLocalServer,
  resolvedUrl: string,
): { label: string; detail: string } {
  let label = `${server.host}:${server.port}`;
  try {
    label = new URL(resolvedUrl).host;
  } catch {
    // Keep the scanner-provided host when a provider returns an invalid URL.
  }

  return {
    label,
    detail: server.processName
      ? `${server.processName} · local port ${server.port}`
      : `Local port ${server.port}`,
  };
}

function SummaryRow({
  icon: Icon,
  label,
  detail,
  trailing,
  onClick,
  disabled = false,
}: {
  icon: ElementType<{ className?: string }>;
  label: string;
  detail?: string | null;
  trailing?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const content = (
    <>
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-foreground">{label}</span>
        {detail ? (
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{detail}</span>
        ) : null}
      </span>
      {trailing ? (
        <span className="max-w-32 shrink-0 truncate text-right text-xs text-muted-foreground">
          {trailing}
        </span>
      ) : null}
    </>
  );

  if (!onClick) {
    return <div className="flex min-h-9 items-start gap-2.5 rounded-md px-2.5 py-2">{content}</div>;
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-9 w-full cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      {content}
    </button>
  );
}

export function EnvironmentSummaryWidget({
  threadRef,
  status,
  workspaceLabel,
  workspaceDetail,
  providerName,
  ProviderIcon,
  quickActionLabel,
  quickActionDisabled,
  refreshing,
  onRefresh,
  onOpenChanges,
  onRunQuickAction,
  onOpenPullRequest,
}: EnvironmentSummaryPopoverProps) {
  const [open, setOpen] = useState(true);
  const hasChanges = status?.hasWorkingTreeChanges === true;
  const fileCount = status?.workingTree.files.length ?? 0;
  const insertions = status?.workingTree.insertions ?? 0;
  const deletions = status?.workingTree.deletions ?? 0;
  const openPullRequest = status?.pr?.state === "open" ? status.pr : null;
  const syncLabel = resolveEnvironmentSyncLabel(status);
  const changesDetail =
    status === null
      ? refreshing
        ? "Checking repository status"
        : "Repository status unavailable"
      : fileCount === 0
        ? "Working tree is clean"
        : `${fileCount} changed ${fileCount === 1 ? "file" : "files"}`;
  const WorkspaceIcon = workspaceLabel === "Worktree" ? FolderGit2Icon : LaptopIcon;
  const syncIcon =
    status?.behindCount && status.aheadCount === 0
      ? ArrowDownIcon
      : status?.aheadCount
        ? ArrowUpIcon
        : CheckIcon;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label={open ? "Hide environment details" : "Show environment details"}
        title={open ? "Hide environment details" : "Show environment details"}
        aria-controls="environment-summary-widget"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => {
            const next = !current;
            if (next) onRefresh();
            return next;
          });
        }}
        className={cn("relative shrink-0", open && "bg-accent text-accent-foreground")}
      >
        <ListTreeIcon className="size-3.5" />
        {hasChanges ? (
          <span
            aria-hidden
            className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-warning ring-2 ring-background"
          />
        ) : null}
      </Button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <aside
              id="environment-summary-widget"
              aria-label="Environment details"
              className="dropdown-glass fixed top-14 right-4 z-40 max-h-[calc(100dvh-4.5rem)] w-[min(21rem,calc(100vw-1rem))] overflow-y-auto rounded-xl p-2 text-popover-foreground shadow-xl [-webkit-app-region:no-drag] max-sm:right-2"
            >
              <div className="flex items-center justify-between px-2.5 pt-1 pb-1.5">
                <div>
                  <p className="text-sm font-medium text-foreground">Environment</p>
                  <p className="text-[11px] text-muted-foreground">
                    Workspace, hosts, and source control
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Refresh environment status"
                  title="Refresh environment status"
                  aria-busy={refreshing}
                  onClick={onRefresh}
                >
                  <RefreshCwIcon className={cn("size-3.5", refreshing && "opacity-50")} />
                </Button>
              </div>

              <div className="space-y-0.5">
                <SummaryRow
                  icon={FileDiffIcon}
                  label="Changes"
                  detail={changesDetail}
                  trailing={
                    status === null ? (
                      "—"
                    ) : hasChanges ? (
                      <span className="flex items-center gap-1 font-medium tabular-nums">
                        <span className="text-success">+{insertions}</span>
                        <span className="text-destructive">-{deletions}</span>
                      </span>
                    ) : (
                      "Clean"
                    )
                  }
                  onClick={onOpenChanges}
                />
                <SummaryRow icon={WorkspaceIcon} label={workspaceLabel} detail={workspaceDetail} />
                <SummaryRow
                  icon={GitBranchIcon}
                  label={status === null ? "Checking status" : (status.refName ?? "No branch")}
                  detail="Current branch"
                  trailing={syncLabel}
                />
                <SummaryRow
                  icon={GitCommitIcon}
                  label={quickActionLabel}
                  detail="Recommended next action"
                  disabled={quickActionDisabled}
                  onClick={onRunQuickAction}
                />
                {openPullRequest ? (
                  <SummaryRow
                    icon={GitPullRequestIcon}
                    label={`#${openPullRequest.number} ${openPullRequest.title}`}
                    detail={`${openPullRequest.headRef} → ${openPullRequest.baseRef}`}
                    trailing="Open"
                    onClick={onOpenPullRequest}
                  />
                ) : null}
              </div>

              {threadRef ? <RunningHosts threadRef={threadRef} /> : null}
              <div className="mx-2.5 my-1.5 h-px bg-border/70" />
              <div className="px-2.5 pt-1 pb-1.5">
                <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Repository</p>
                <div className="flex items-center gap-2 text-xs">
                  <ProviderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-foreground">{providerName}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {status === null
                      ? "Status unavailable"
                      : status.hasPrimaryRemote
                        ? "Remote connected"
                        : "Local only"}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  {syncIcon === ArrowDownIcon ? (
                    <ArrowDownIcon className="size-3" />
                  ) : syncIcon === ArrowUpIcon ? (
                    <ArrowUpIcon className="size-3" />
                  ) : (
                    <CheckIcon className="size-3" />
                  )}
                  <span>{syncLabel}</span>
                </div>
              </div>
            </aside>,
            document.body,
          )
        : null}
    </>
  );
}

function RunningHosts({ threadRef }: { threadRef: ScopedThreadRef }) {
  const servers = useDiscoveredPorts(threadRef.environmentId);

  if (servers.length === 0) return null;

  return (
    <div className="px-2.5 pt-1 pb-1.5">
      <div className="mx-0 mb-2 h-px bg-border/70" />
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium text-muted-foreground">Running hosts</p>
        <span className="text-[10px] text-success">{servers.length} active</span>
      </div>
      <div className="space-y-0.5">
        {servers.map((server) => {
          const resolvedUrl = resolveDiscoveredServerUrl(threadRef.environmentId, server.url);
          const presentation = resolveEnvironmentHostPresentation(server, resolvedUrl);
          return (
            <SummaryRow
              key={`${server.host}:${server.port}`}
              icon={RadioTowerIcon}
              label={presentation.label}
              detail={presentation.detail}
              trailing={
                <span className="inline-flex items-center gap-1.5 text-success">
                  <span className="size-1.5 rounded-full bg-success" aria-hidden />
                  Live
                </span>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
