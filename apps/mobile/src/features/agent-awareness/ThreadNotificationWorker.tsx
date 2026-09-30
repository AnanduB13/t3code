import { useAtomValue } from "@effect/atom-react";
import { Atom, AsyncResult } from "effect/unstable/reactivity";
import * as Effect from "effect/Effect";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import { useManagedRelayEnvironments } from "../cloud/managedRelayState";
import { supportsAgentAwarenessPush } from "./capabilities";
import { useWorkspaceState } from "../../state/workspace";
import { useServerConfigs, useThreadShells } from "../../state/entities";
import { environmentShell } from "../../state/shell";
import { environmentCatalog } from "../../connection/catalog";
import { mobilePreferencesAtom } from "../../state/preferences";
import { androidNotifications } from "./androidChatNotifications";
import { directChatNotificationsEnabled } from "./directNotificationPreferences";
import { ensureAgentNotificationChannels } from "./notificationPermissions";
import {
  getAgentAwarenessRegistrationStatus,
  subscribeAgentAwarenessRegistrationStatus,
} from "./remoteRegistration";
import {
  reconcileAndroidChatNotifications,
  type AndroidChatNotification,
} from "./androidNotificationModel";

const liveEnvironmentsAtom = Atom.make((get) => {
  const catalog = get(environmentCatalog.catalogValueAtom);
  return new Set(
    [...catalog.entries.keys()].filter(
      (id) => get(environmentShell.stateValueAtom(id)).status === "live",
    ),
  );
});

export function ThreadNotificationWorker() {
  return Platform.OS === "android" || Platform.OS === "ios" ? <NotificationWorker /> : null;
}

function NotificationWorker() {
  const threads = useThreadShells();
  const managed = useManagedRelayEnvironments();
  const { environments } = useWorkspaceState();
  const configs = useServerConfigs();
  const registrationStatus = useSyncExternalStore(
    subscribeAgentAwarenessRegistrationStatus,
    getAgentAwarenessRegistrationStatus,
    () => "unknown" as const,
  );
  // A linked server belongs to cloud delivery only after this device is registered.
  // Otherwise an active direct connection must still be able to deliver its alerts.
  const cloudOwnedEnvironments = useMemo(() => {
    if (
      !supportsAgentAwarenessPush() ||
      managed.accountId === null ||
      registrationStatus !== "registered"
    )
      return new Set<string>();
    const linked = new Set<string>([
      ...(managed.data ?? []).map((environment) => environment.environmentId),
      ...environments
        .filter((environment) => environment.isRelayManaged)
        .map((environment) => environment.environmentId),
    ]);
    for (const id of linked) {
      const config = [...configs].find(([environmentId]) => environmentId === id)?.[1];
      if (config?.environment.capabilities.agentActivityPublishing === false) linked.delete(id);
    }
    return linked;
  }, [managed.accountId, managed.data, environments, configs, registrationStatus]);
  const liveEnvironments = useAtomValue(liveEnvironmentsAtom);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const enabled =
    AsyncResult.isSuccess(preferences) && directChatNotificationsEnabled(preferences.value);
  const savedChoice = AsyncResult.isSuccess(preferences)
    ? (preferences.value.directChatNotificationsEnabled ??
      preferences.value.androidChatNotificationsEnabled)
    : undefined;
  const previous = useRef(new Map<string, AndroidChatNotification>());
  const [appState, setAppState] = useState(AppState.currentState);
  const [permission, setPermission] = useState(false);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    // A saved choice also changes when permission is granted from the default-on state.
    if (savedChoice === false || appState !== "active") return;
    let disposed = false;
    void Effect.runPromise(ensureAgentNotificationChannels)
      .then(() => Notifications.getPermissionsAsync())
      .then((result) => {
        if (!disposed) setPermission(result.granted);
      })
      .catch((error: unknown) => console.warn("Could not read notification permission", error));
    return () => {
      disposed = true;
    };
  }, [appState, savedChoice]);
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    return () => {
      Notifications.setNotificationHandler(null);
      void androidNotifications?.stop();
    };
  }, []);

  useEffect(() => {
    const change = reconcileAndroidChatNotifications(
      previous.current,
      threads,
      liveEnvironments,
      cloudOwnedEnvironments,
    );
    previous.current = change.next;
    const alerts = enabled && permission ? change.alerts : [];
    const running =
      enabled && permission
        ? change.monitored.map((chat) => ({ ...chat, deepLink: Linking.createURL(chat.deepLink) }))
        : [];
    let disposed = false;
    const update = () => {
      queue.current = queue.current
        .then(async () => {
          if (!disposed) await androidNotifications?.update(running, appState === "active");
        })
        .catch((error: unknown) =>
          console.warn("Could not update chat progress notification", error),
        );
    };
    queue.current = queue.current
      .then(async () => {
        for (const key of enabled && permission
          ? change.clearAlertKeys
          : new Set([...change.clearAlertKeys, ...change.next.keys()]))
          await Notifications.dismissNotificationAsync(`t3-chat:${key}`);
        for (const chat of alerts)
          await Notifications.scheduleNotificationAsync({
            identifier: `t3-chat:${chat.key}`,
            content: {
              title: chat.title,
              body: chat.body,
              sound: "default",
              data: { deepLink: chat.deepLink },
            },
            trigger: Platform.OS === "android" ? { channelId: "t3-chat-alerts" } : null,
          });
      })
      .catch((error: unknown) => console.warn("Could not show chat alert", error));
    update();
    const heartbeat = androidNotifications && running.length ? setInterval(update, 30_000) : null;
    return () => {
      disposed = true;
      if (heartbeat) clearInterval(heartbeat);
    };
  }, [threads, liveEnvironments, cloudOwnedEnvironments, enabled, permission, appState]);
  return null;
}
