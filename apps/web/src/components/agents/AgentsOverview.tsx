import { Link } from "@tanstack/react-router";
import { BotIcon, MonitorIcon, RefreshCwIcon } from "lucide-react";
import type { DiscoveredAgentRuntime, EnvironmentId } from "@t3tools/contracts";

import { agentDiscoveryQuery } from "../../state/agentDiscovery";
import { useEnvironments, type EnvironmentPresentation } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../../workspaceTitlebar";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { useAgentsSidebarStore } from "./agentsSidebarStore";

function AgentRuntimeRow({
  runtime,
  environmentId,
}: {
  readonly runtime: DiscoveredAgentRuntime;
  readonly environmentId: EnvironmentId;
}) {
  const openHermes = useAgentsSidebarStore((state) => state.openHermes);
  const name = runtime.kind === "hermes" ? "Hermes" : "OpenClaw";
  return (
    <article className="flex flex-wrap items-start gap-3 px-4 py-4">
      <BotIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium">{name}</h3>
          <Badge variant={runtime.state === "running" ? "success" : "outline"}>
            {runtime.state === "running"
              ? "Running"
              : runtime.state === "starting"
                ? "Starting"
                : "Not reachable"}
          </Badge>
        </div>
        {runtime.model ? (
          <p className="mt-1 text-xs text-muted-foreground">{runtime.model}</p>
        ) : null}
        {runtime.agents.length > 0 ? (
          <ul aria-label={`${name} agents`} className="mt-2 flex flex-wrap gap-2 text-sm">
            {runtime.agents.map((agent) => (
              <li key={agent.id} className="rounded-md bg-muted px-2 py-1">
                {agent.name}
              </li>
            ))}
          </ul>
        ) : null}
        {runtime.message ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{runtime.message}</p>
        ) : null}
        {runtime.kind === "openclaw" && runtime.state === "running" ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Manage conversations in OpenClaw on this computer.
          </p>
        ) : null}
      </div>
      {runtime.kind === "hermes" ? (
        <Button size="sm" variant="outline" onClick={() => openHermes(environmentId)}>
          {runtime.state === "running" ? "Open Hermes" : "Connection details"}
        </Button>
      ) : null}
    </article>
  );
}

function AgentComputer({ environment }: { readonly environment: EnvironmentPresentation }) {
  const connected = environment.connection.phase === "connected";
  const discovery = useEnvironmentQuery(
    connected
      ? agentDiscoveryQuery({
          environmentId: environment.environmentId,
          input: {},
        })
      : null,
  );
  return (
    <section
      aria-label={`Agents on ${environment.label}`}
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MonitorIcon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{environment.label}</h2>
          {connected && discovery.data && discovery.data.hostname !== environment.label ? (
            <p className="truncate text-xs text-muted-foreground">{discovery.data.hostname}</p>
          ) : null}
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Refresh agents on ${environment.label}`}
          disabled={!connected || discovery.isPending}
          onClick={discovery.refresh}
        >
          <RefreshCwIcon />
        </Button>
      </header>
      {!connected ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">
          Computer disconnected. Reconnect it in Settings → Connections to see its agents.
        </p>
      ) : discovery.error ? (
        <div role="alert" className="px-4 py-5 text-sm text-muted-foreground">
          Could not discover agents on this computer. Check its connection and that its T3 server is
          up to date, then refresh.
          <p className="mt-2 text-xs">{discovery.error}</p>
        </div>
      ) : !discovery.data ? (
        <p role="status" className="px-4 py-5 text-sm text-muted-foreground">
          Looking for Hermes and OpenClaw…
        </p>
      ) : (
        <div className="divide-y divide-border">
          {discovery.data.runtimes.map((runtime) => (
            <AgentRuntimeRow
              key={runtime.kind}
              runtime={runtime}
              environmentId={environment.environmentId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function AgentsOverview() {
  const { environments, isReady } = useEnvironments();
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden">
      <header
        className={cn(
          "flex min-h-12 shrink-0 flex-wrap items-center gap-3 border-b border-border px-3 py-2 sm:px-5",
          COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
        )}
      >
        <BotIcon className="size-4" />
        <h1 className="flex-1 text-sm font-semibold">Agents</h1>
        <Button size="sm" variant="outline" render={<Link to="/settings/connections" />}>
          Connect a computer
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-5">
          <p className="text-sm leading-6 text-muted-foreground">
            Discover Hermes and OpenClaw on your connected computers. Open Hermes to chat, or check
            your OpenClaw gateway and agents.
          </p>
          {environments.map((environment) => (
            <AgentComputer key={environment.environmentId} environment={environment} />
          ))}
          {environments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {isReady
                ? "Connect a computer in Settings → Connections to discover its agents."
                : "Loading connected computers…"}
            </p>
          ) : null}
        </div>
      </div>
    </SidebarInset>
  );
}
