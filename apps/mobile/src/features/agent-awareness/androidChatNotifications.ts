import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import type { AndroidChatNotification } from "./androidNotificationModel";

interface AndroidNotificationsModule {
  update(chats: readonly AndroidChatNotification[], allowStart: boolean): Promise<void>;
  waitUntilStopped(): Promise<void>;
  stop(): Promise<void>;
}

export const androidNotifications =
  Platform.OS === "android"
    ? requireOptionalNativeModule<AndroidNotificationsModule>("T3ChatNotifications")
    : null;
