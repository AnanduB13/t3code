import { useEffect, useState } from "react";

import {
  readSystemNotificationAccess,
  requestSystemNotificationAccess,
  type SystemNotificationAccess,
} from "../threadNotifications";

/**
 * Live system notification permission. Users change it in browser or OS
 * settings, so it is re-read on focus and on permission change events.
 */
export function useSystemNotificationAccess() {
  const [access, setAccess] = useState<SystemNotificationAccess>(readSystemNotificationAccess);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Listens to window focus and the browser permission status, which change outside React.
  useEffect(() => {
    let disposed = false;
    let status: PermissionStatus | undefined;
    const sync = () => setAccess(readSystemNotificationAccess());
    window.addEventListener("focus", sync);
    void navigator.permissions
      ?.query({ name: "notifications" })
      .then((result) => {
        if (disposed) return;
        status = result;
        status.addEventListener("change", sync);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      window.removeEventListener("focus", sync);
      status?.removeEventListener("change", sync);
    };
  }, []);

  const request = async () => {
    const result = await requestSystemNotificationAccess();
    setAccess(result);
    return result;
  };

  return { access, request };
}
