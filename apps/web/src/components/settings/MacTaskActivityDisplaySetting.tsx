import type { DesktopTaskActivityDisplay } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

/** Display preferences belong to this desktop client, regardless of the connected environment. */
export function MacTaskActivityDisplaySetting() {
  const displayId = useClientSettings((settings) => settings.macTaskActivityDisplayId);
  const updateSettings = useUpdateClientSettings();
  const bridge = window.desktopBridge;
  const [displays, setDisplays] = useState<readonly DesktopTaskActivityDisplay[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = () => {
      const revision = ++request;
      void bridge
        ?.getTaskActivityDisplays?.()
        .then((next) => {
          if (!active || revision !== request) return;
          setDisplays(next);
          setFailed(false);
        })
        .catch(() => {
          if (active && revision === request) setFailed(true);
        });
    };
    const unsubscribe = bridge?.onTaskActivityDisplaysChanged?.(refresh);
    refresh();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [bridge]);

  if (!bridge?.getTaskActivityDisplays) return null;
  const selected = displays?.find((display) => display.id === displayId);
  const disconnected = displays !== null && displayId !== null && !selected;

  return (
    <SettingsRow
      {...searchableSetting("notch-display")}
      description={
        failed
          ? "Connected displays couldn't be loaded. Reopen Settings to try again."
          : disconnected
            ? "This display is disconnected. Activity follows T3 Code until it reconnects."
            : "Choose where task activity appears. Your choice is remembered when a display reconnects."
      }
      resetAction={
        displayId !== null ? (
          <SettingResetButton
            label="notch display"
            onClick={() => updateSettings({ macTaskActivityDisplayId: null })}
          />
        ) : null
      }
      control={
        <div className="w-full sm:w-64">
          <Select
            value={displayId === null ? "follow-app" : String(displayId)}
            disabled={displays === null || failed}
            onValueChange={(value) => {
              const display = displays?.find((candidate) => String(candidate.id) === value);
              if (value === "follow-app" || display) {
                updateSettings({ macTaskActivityDisplayId: display?.id ?? null });
              }
            }}
          >
            <SelectTrigger size="sm" className="w-full" aria-label="Notch display">
              <SelectValue>
                {displays === null && !failed
                  ? "Loading displays…"
                  : displayId === null
                    ? "Follow T3 Code"
                    : (selected?.label ?? "Selected display (disconnected)")}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem hideIndicator value="follow-app">
                Follow T3 Code
              </SelectItem>
              {displays?.map((display) => (
                <SelectItem key={display.id} hideIndicator value={String(display.id)}>
                  {display.label} ·{" "}
                  {display.internal
                    ? "Built-in"
                    : display.primary
                      ? "Main"
                      : `${display.width} × ${display.height}`}
                </SelectItem>
              ))}
              {disconnected ? (
                <SelectItem disabled value={String(displayId)}>
                  Selected display (disconnected)
                </SelectItem>
              ) : null}
            </SelectPopup>
          </Select>
        </div>
      }
    />
  );
}
