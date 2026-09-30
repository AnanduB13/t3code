import type { Preferences } from "../../persistence/mobile-preferences";

/** Preserve the old Android opt-out when adopting the cross-platform setting. */
export function directChatNotificationsEnabled(preferences: Preferences): boolean {
  return (
    preferences.directChatNotificationsEnabled ??
    preferences.androidChatNotificationsEnabled ??
    true
  );
}
