import type { DesktopTaskActivityDisplay } from "@t3tools/contracts";
import { T, useGT } from "gt-react";
import { useEffect, useState } from "react";

import { useClientSettings, updateClientSettings } from "../../hooks/useSettings";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";

/** Display preferences belong to this desktop client, regardless of the connected environment. */
export function MacTaskActivityDisplaySetting() {
  const gt = useGT();
  const setting = useSearchableSetting();
  const displayId = useClientSettings((settings) => settings.macTaskActivityDisplayId);
  const updateSettings = updateClientSettings;
  const bridge = window.desktopBridge;
  const [displays, setDisplays] = useState<readonly DesktopTaskActivityDisplay[] | null>(null);
  const [failed, setFailed] = useState(false);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- The Electron display list is external state; subscribe until this settings control unmounts.
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
      {...setting("notch-display")}
      description={
        failed
          ? gt("Connected displays couldn't be loaded. Reopen Settings to try again.")
          : disconnected
            ? gt("This display is disconnected. Activity follows T3 Code until it reconnects.")
            : gt(
                "Choose where task activity appears. Your choice is remembered when a display reconnects.",
              )
      }
      resetAction={
        displayId !== null ? (
          <SettingResetButton
            ariaLabel={gt("Reset notch display to default")}
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
            <SelectTrigger size="sm" className="w-full" aria-label={gt("Notch display")}>
              <SelectValue>
                {displays === null && !failed
                  ? gt("Loading displays…")
                  : displayId === null
                    ? gt("Follow T3 Code")
                    : (selected?.label ?? gt("Selected display (disconnected)"))}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem hideIndicator value="follow-app">
                <T>Follow T3 Code</T>
              </SelectItem>
              {displays?.map((display) => (
                <SelectItem key={display.id} hideIndicator value={String(display.id)}>
                  {display.label} ·{" "}
                  {display.internal
                    ? gt("Built-in")
                    : display.primary
                      ? gt("Main")
                      : `${display.width} × ${display.height}`}
                </SelectItem>
              ))}
              {disconnected ? (
                <SelectItem disabled value={String(displayId)}>
                  <T>Selected display (disconnected)</T>
                </SelectItem>
              ) : null}
            </SelectPopup>
          </Select>
        </div>
      }
    />
  );
}
