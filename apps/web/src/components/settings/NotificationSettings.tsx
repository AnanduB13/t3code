import { useState } from "react";
import { Button } from "../ui/button";

import {
  hasDesktopNotifications,
  hasNotificationSound,
  NOTIFICATION_MODE_LABELS,
  unlockNotificationAudio,
} from "../../threadNotifications";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

export function NotificationSettings() {
  const mode = useScopedSettings((settings) => settings.notificationMode);
  const updateSettings = useUpdateScopedSettings();
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [permission, setPermission] = useState(() =>
    typeof Notification === "undefined" ? "denied" : Notification.permission,
  );

  const requestPermission = async () => {
    setPermissionMessage(null);
    if (typeof Notification === "undefined" || (!window.desktopBridge && !window.isSecureContext)) {
      setPermissionMessage(
        "Notifications need a supported browser over HTTPS, or the desktop app.",
      );
      return false;
    }
    setRequesting(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        setPermissionMessage(
          "Allow notifications for T3 Code in your browser or system settings, then try again.",
        );
      }
      return result === "granted";
    } catch {
      setPermissionMessage(
        "System notifications are unavailable. Check your browser or system notification settings.",
      );
      return false;
    } finally {
      setRequesting(false);
    }
  };

  return (
    <SettingsRow
      {...searchableSetting("thread-notifications")}
      description={
        permissionMessage ??
        "System alerts when a full run finishes, including while T3 Code is focused. Tool calls do not trigger completion alerts. Failures, questions, and approvals also alert while the app is in the background."
      }
      control={
        <div className="flex w-full flex-col items-end gap-2 sm:w-56">
          <Select
            value={mode}
            disabled={requesting}
            onValueChange={async (value) => {
              if (
                value !== "off" &&
                value !== "notifications" &&
                value !== "sound" &&
                value !== "notifications-and-sound"
              )
                return;
              setPermissionMessage(null);
              if (hasNotificationSound(value)) unlockNotificationAudio();
              if (hasDesktopNotifications(value) && !(await requestPermission())) return;
              updateSettings({ notificationMode: value });
            }}
          >
            <SelectTrigger size="sm" className="w-full sm:w-56" aria-label="Thread notifications">
              <SelectValue>{NOTIFICATION_MODE_LABELS[mode]}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {Object.entries(NOTIFICATION_MODE_LABELS).map(([value, label]) => (
                <SelectItem key={value} hideIndicator value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          {hasDesktopNotifications(mode) && permission !== "granted" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={requesting}
              onClick={() => void requestPermission()}
            >
              Allow system notifications
            </Button>
          ) : null}
        </div>
      }
    />
  );
}
