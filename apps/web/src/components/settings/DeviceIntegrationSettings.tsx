import { searchableSetting } from "./settingsSearch";
import type { EnvironmentId, SshDeviceHostConfig } from "@t3tools/contracts";
import { useState } from "react";
import { usePrimaryEnvironment } from "~/state/environments";
import { deviceEnvironment, useDeviceState } from "~/state/device";
import { useAtomCommand } from "~/state/use-atom-command";
import { AnimatedHeight } from "~/components/AnimatedHeight";
import {
  AgentDeviceSetupStatus,
  DeviceHubSetupStatus,
  PlatformStatus,
  platformSetupStatus,
  deviceHubDescription,
  agentDeviceDescription,
} from "~/components/device/DeviceSetup";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { DeviceHostsSettings } from "./DeviceHostsSettings";
export function DeviceIntegrationSettings() {
  const selected = usePrimaryEnvironment();
  const connected = selected?.connection.phase === "connected" && selected.serverConfig !== null;
  const environmentId = connected ? selected.environmentId : null;
  const aggregate = true;

  return (
    <SettingsSection
      id="devices"
      title={aggregate && selected ? `Devices · ${selected.label}` : "Devices"}
    >
      <DeviceIntegrationControls
        key={selected?.environmentId ?? "none"}
        environmentId={environmentId}
        hosts={selected?.serverConfig?.settings.deviceHosts ?? []}
        enabled={selected?.serverConfig?.settings.enableDeviceSupport ?? false}
        agentAccessEnabled={selected?.serverConfig?.settings.enableAgentDeviceAccess ?? false}
      />
    </SettingsSection>
  );
}

function DeviceIntegrationControls({
  environmentId,
  hosts,
  enabled,
  agentAccessEnabled,
}: {
  environmentId: EnvironmentId | null;
  hosts: ReadonlyArray<SshDeviceHostConfig>;
  enabled: boolean;
  agentAccessEnabled: boolean;
}) {
  const { state, loaded } = useDeviceState(environmentId);
  const configure = useAtomCommand(deviceEnvironment.configure);
  const list = useAtomCommand(deviceEnvironment.list, { reportFailure: false });
  const [pending, setPending] = useState<"hub" | "check" | "agent" | null>(null);
  const busy = state.hostStatus === "installing" || state.hostStatus === "starting";
  const [platformsRevealed, setPlatformsRevealed] = useState(false);
  // Keep diagnostics visible through subsequent agent setup and refresh phases.
  if (platformsRevealed && !enabled) setPlatformsRevealed(false);
  if (enabled && !platformsRevealed && state.hostStatus === "ready" && pending !== "hub") {
    setPlatformsRevealed(true);
  }

  const update = async (
    kind: NonNullable<typeof pending>,
    input: { enabled?: boolean; agentAccessEnabled?: boolean },
  ) => {
    if (!environmentId) return;
    setPending(kind);
    try {
      const result = await configure({ environmentId, input });
      if (result._tag === "Success" && input.enabled === true && !state.onboardingCompleted) {
        await configure({ environmentId, input: { onboardingCompleted: true } });
      }
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <SettingsRow
        {...searchableSetting("device-hub")}
        description={deviceHubDescription}
        control={
          <>
            {pending === "hub" ? <DeviceHubSetupStatus state={state} pending compact /> : null}
            <Switch
              checked={enabled}
              disabled={!loaded || !environmentId || busy || pending !== null}
              aria-
              {...searchableSetting("device-hub")}
              onCheckedChange={(checked) =>
                void update("hub", {
                  enabled: Boolean(checked),
                  ...(checked ? {} : { agentAccessEnabled: false }),
                })
              }
            />
          </>
        }
      />
      <AnimatedHeight>
        {platformsRevealed ? (
          <SettingsRow
            {...searchableSetting("device-platform-support")}
            status={
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <PlatformStatus compact platform="iOS" status={platformSetupStatus(state, "ios")} />
                <PlatformStatus
                  compact
                  platform="Android"
                  status={platformSetupStatus(state, "android")}
                />
              </div>
            }
            control={
              <Button
                size="sm"
                variant="outline"
                disabled={!environmentId || !enabled || busy || pending !== null}
                onClick={() => {
                  if (!environmentId) return;
                  setPending("check");
                  void list({ environmentId, input: {} }).finally(() => setPending(null));
                }}
              >
                {pending === "check" ? "Checking…" : "Refresh"}
              </Button>
            }
          />
        ) : null}
      </AnimatedHeight>
      <SettingsRow
        {...searchableSetting("agent-device-access")}
        description={agentDeviceDescription}
        control={
          <>
            {pending === "agent" ? <AgentDeviceSetupStatus state={state} pending compact /> : null}
            <Switch
              checked={agentAccessEnabled}
              disabled={!loaded || !environmentId || !enabled || busy || pending !== null}
              aria-
              {...searchableSetting("agent-device-access")}
              onCheckedChange={(checked) =>
                void update("agent", { agentAccessEnabled: Boolean(checked) })
              }
            />
          </>
        }
      />
      {state.hostStatus === "failed" && state.hostStatusDetail ? (
        <p role="alert" className="px-4 py-3 text-xs text-destructive">
          {state.hostStatusDetail}
        </p>
      ) : null}
      <DeviceHostsSettings environmentId={environmentId} hosts={hosts} />
    </>
  );
}
