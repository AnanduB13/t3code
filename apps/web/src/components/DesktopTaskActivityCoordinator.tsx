import { useAtomValue } from "@effect/atom-react";
import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import { useNavigate } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { Atom } from "effect/unstable/reactivity";
import { useEffect, useRef } from "react";

import { environmentCatalog } from "../connection/catalog";
import { projectDesktopTasks, sortDesktopTasks } from "../desktopTaskActivity";
import { useClientSettings, useClientSettingsHydrated } from "../hooks/useSettings";
import { environmentShell } from "../state/shell";

const tasksAtom = Atom.make((get) => {
  const catalog = get(environmentCatalog.catalogValueAtom);
  const tasks = [];
  for (const environmentId of enabledEnvironmentIds(catalog)) {
    const shell = get(environmentShell.stateValueAtom(environmentId));
    if (shell.status !== "live" || Option.isNone(shell.snapshot)) continue;
    tasks.push(...projectDesktopTasks(environmentId, shell.snapshot.value));
  }
  return sortDesktopTasks(tasks);
});

/** Mounted only in the macOS desktop renderer; shares its existing environment subscriptions. */
export function DesktopTaskActivityCoordinator() {
  const tasks = useAtomValue(tasksAtom);
  const enabled = useClientSettings((settings) => settings.macTaskActivityEnabled);
  const hydrated = useClientSettingsHydrated();
  const navigate = useNavigate();
  const bridge = window.desktopBridge;
  const previous = useRef("");

  useEffect(() => {
    return bridge?.onTaskActivityOpen?.(({ environmentId, threadId }) => {
      void navigate({ to: "/$environmentId/$threadId", params: { environmentId, threadId } });
    });
  }, [bridge, navigate]);

  // Equivalent shell updates (e.g. timestamps) must not wake the panel renderer.
  useEffect(() => {
    const activity = { enabled: hydrated && enabled, tasks: enabled ? tasks : [] };
    const serialized = JSON.stringify(activity);
    if (previous.current === serialized) return;
    previous.current = serialized;
    void bridge?.setTaskActivity?.(activity).catch((error: unknown) => {
      previous.current = "";
      console.warn("Could not update desktop task activity", error);
    });
  }, [enabled, hydrated, tasks, bridge]);

  useEffect(() => {
    return () => {
      previous.current = "";
      void bridge?.setTaskActivity?.({ enabled: false, tasks: [] }).catch(() => undefined);
    };
  }, [bridge]);

  return null;
}
