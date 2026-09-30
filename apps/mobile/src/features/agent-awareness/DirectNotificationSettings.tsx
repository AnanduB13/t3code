import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import * as Effect from "effect/Effect";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Alert, AppState, Linking, Platform } from "react-native";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { SettingsSwitchRow } from "../settings/components/SettingsSwitchRow";
import { requestAgentNotificationPermission } from "./notificationPermissions";
import { androidNotifications } from "./androidChatNotifications";
import { directChatNotificationsEnabled } from "./directNotificationPreferences";

export function DirectNotificationSettings() {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const save = useAtomSet(updateMobilePreferencesAtom);
  const [granted, setGranted] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "android" && Platform.OS !== "ios") return;
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
  if (Platform.OS !== "android" && Platform.OS !== "ios") return null;
  const change = async (enabled: boolean) => {
    setBusy(true);
    try {
      if (!enabled) {
        save({ directChatNotificationsEnabled: false, androidChatNotificationsEnabled: false });
        await androidNotifications?.stop();
        return;
      }
      const result = await Effect.runPromise(requestAgentNotificationPermission);
      setGranted(result.type === "granted");
      if (result.type === "granted")
        save({ directChatNotificationsEnabled: true, androidChatNotificationsEnabled: true });
      else if (result.type === "denied" && !result.canAskAgain)
        Alert.alert("Allow notifications", "Enable notifications for T3 Code in system settings.", [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ]);
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
      label="Direct chat notifications"
      subtitle={
        Platform.OS === "android" && androidNotifications
          ? "System alerts when a run finishes or needs attention, with quiet progress while it runs."
          : "System alerts when a run finishes or needs attention while connected. Use T3 Connect for delivery when the app is suspended or closed."
      }
      disabled={busy || !AsyncResult.isSuccess(preferences)}
      value={
        granted &&
        AsyncResult.isSuccess(preferences) &&
        directChatNotificationsEnabled(preferences.value)
      }
      onValueChange={(enabled) => void change(enabled)}
    />
  );
}
