import { msg, T, useGT, useMessages } from "gt-react";
import { useState } from "react";

import { useSystemNotificationAccess } from "../../hooks/useSystemNotificationAccess";
import {
  hasDesktopNotifications,
  hasNotificationSound,
  notificationModeFor,
  playNotificationSound,
  unlockNotificationAudio,
  type SystemNotificationAccess,
} from "../../threadNotifications";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { toastManager } from "../ui/toast";
import { SettingsRow } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

const ACCESS_PROBLEMS: Partial<Record<SystemNotificationAccess, string>> = {
  unsupported: msg(
    "This browser cannot show system notifications here. Open T3 Code over HTTPS or use the desktop app.",
  ),
  denied: msg(
    "Blocked by your browser or system. Allow notifications for this site in its settings, then come back.",
  ),
  default: msg("Your browser has not allowed notifications yet."),
};

/** System alerts and sound, plus a test so users can confirm alerts arrive. */
export function NotificationSettings() {
  const searchableSetting = useSearchableSetting();
  const gt = useGT();
  const m = useMessages();
  const mode = useScopedSettings((settings) => settings.notificationMode);
  const updateSettings = useUpdateScopedSettings();
  const { access, request } = useSystemNotificationAccess();
  const [requesting, setRequesting] = useState(false);
  const system = hasDesktopNotifications(mode);
  const sound = hasNotificationSound(mode);
  const problemMessage = system ? ACCESS_PROBLEMS[access] : undefined;
  const problem = problemMessage === undefined ? undefined : m(problemMessage);

  const allow = async () => {
    setRequesting(true);
    try {
      return (await request()) === "granted";
    } finally {
      setRequesting(false);
    }
  };

  const sendTest = () => {
    if (sound) {
      unlockNotificationAudio();
      void playNotificationSound("input", () => true);
    }
    toastManager.add({
      type: "info",
      title: gt("Test notification"),
      description: gt("In-app alerts look like this."),
      data: { hideCopyButton: true },
    });
    if (system && access === "granted") {
      const notification = new Notification(gt("Test notification"), {
        body: gt("System alerts from T3 Code look like this."),
        silent: sound,
      });
      notification.addEventListener("click", () => window.focus());
    }
  };

  return (
    <>
      <SettingsRow
        {...searchableSetting("thread-notifications")}
        description={
          problem ??
          (system
            ? gt(
                "OS alerts when a run finishes, and when a thread fails or needs your input while T3 Code is in the background.",
              )
            : gt("Get an OS alert when a thread finishes, fails, or needs your input."))
        }
        control={
          <div className="flex items-center gap-2">
            {system && access === "default" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={requesting}
                onClick={() => void allow()}
              >
                <T>Allow</T>
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={sendTest}>
              <T>Send test</T>
            </Button>
            <Switch
              checked={system}
              disabled={requesting}
              aria-label={gt("System notifications")}
              onCheckedChange={async (checked) => {
                if (checked && access !== "granted" && !(await allow())) return;
                updateSettings({
                  notificationMode: notificationModeFor({ system: checked, sound }),
                });
              }}
            />
          </div>
        }
      />
      <SettingsRow
        {...searchableSetting("notification-sound")}
        description={gt(
          "Play a chime when a thread finishes or needs you, with or without system notifications.",
        )}
        control={
          <Switch
            checked={sound}
            aria-label={gt("Notification sound")}
            onCheckedChange={(checked) => {
              if (checked) unlockNotificationAudio();
              updateSettings({ notificationMode: notificationModeFor({ system, sound: checked }) });
            }}
          />
        }
      />
    </>
  );
}
