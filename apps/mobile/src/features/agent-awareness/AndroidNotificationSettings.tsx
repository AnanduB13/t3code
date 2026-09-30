import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import * as Effect from "effect/Effect";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Alert, AppState, Linking, Platform } from "react-native";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { SettingsSwitchRow } from "../settings/components/SettingsSwitchRow";
import { requestAgentNotificationPermission } from "./notificationPermissions";
import { androidNotifications } from "./androidNotifications";

export function AndroidNotificationSettings() {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const save = useAtomSet(updateMobilePreferencesAtom);
  const [granted, setGranted] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    let disposed = false;
    const refresh = () =>
      void Notifications.getPermissionsAsync()
        .then((result) => {
          if (!disposed) setGranted(result.granted);
        })
        .catch((error: unknown) => console.warn("Could not read notification permission", error));
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      disposed = true;
      subscription.remove();
    };
  }, []);
  if (Platform.OS !== "android") return null;
  const change = async (enabled: boolean) => {
    setBusy(true);
    try {
      if (!enabled) {
        save({ androidChatNotificationsEnabled: false });
        await androidNotifications?.stop();
        return;
      }
      const result = await Effect.runPromise(requestAgentNotificationPermission);
      setGranted(result.type === "granted");
      if (result.type === "granted") save({ androidChatNotificationsEnabled: true });
      else if (result.type === "denied" && !result.canAskAgain)
        Alert.alert(
          "Allow notifications",
          "Enable notifications for T3 Code in Android settings.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => void Linking.openSettings() },
          ],
        );
    } catch (error) {
      Alert.alert(
        "Notifications unavailable",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsSwitchRow
      icon="bell.badge"
      label="Chat notifications"
      subtitle={
        androidNotifications
          ? "Completion and attention alerts, with ongoing progress while chats run. Tap a notification to open its chat."
          : "Install the latest Android build to enable chat notifications."
      }
      disabled={busy || !androidNotifications || !AsyncResult.isSuccess(preferences)}
      value={
        granted &&
        AsyncResult.isSuccess(preferences) &&
        preferences.value.androidChatNotificationsEnabled === true
      }
      onValueChange={(enabled) => void change(enabled)}
    />
  );
}
