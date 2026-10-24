import { useAtomValue } from "@effect/atom-react";
import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { taskRequestKey, validTaskResponse } from "@t3tools/shared/desktopTaskRequests";
import { DesktopTaskResponse } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncResult, Atom } from "effect/reactivity";
import { useEffect, useRef } from "react";

import { environmentCatalog } from "../connection/catalog";
import { APP_BASE_NAME, APP_EDITION_LABEL } from "../branding";
import { projectDesktopTasks, sortDesktopTasks } from "../desktopTaskActivity";
import { projectDesktopTaskRequests } from "../desktopTaskRequests";
import { desktopTaskProjectIconAtom } from "../desktopTaskProjectIcon";
import { deriveProjectIdentity } from "../projectIdentity";
import { projectFaviconUrlAtom } from "../state/assets";
import { serverEnvironment } from "../state/server";
import { useClientSettings, useClientSettingsHydrated } from "../hooks/useSettings";
import { environmentShell } from "../state/shell";
import { environmentThreadDetails, threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";

const decodeResponse = Schema.decodeUnknownOption(DesktopTaskResponse);

const tasksAtom = Atom.family((enabled: boolean) =>
  Atom.make((get) => {
    if (!enabled) return [];
    const catalog = get(environmentCatalog.catalogValueAtom);
    const tasks = [];
    for (const environmentId of enabledEnvironmentIds(catalog)) {
      const shell = get(environmentShell.stateValueAtom(environmentId));
      if (shell.status !== "live" || Option.isNone(shell.snapshot)) continue;
      const snapshot = shell.snapshot.value;
      const config = get(serverEnvironment.configValueAtom(environmentId));
      const projected = projectDesktopTasks(environmentId, snapshot, {
        providers: config?.providers ?? [],
      });
      const threadProjects = new Map(
        snapshot.threads.map((thread) => [thread.id, thread.projectId]),
      );
      const activeProjectIds = new Set(projected.map((task) => threadProjects.get(task.threadId)));
      const icons = new Map(
        snapshot.projects
          .filter((project) => activeProjectIds.has(project.id))
          .map((project) => {
            const fallback = deriveProjectIdentity(project.title);
            const override = project.projectIcon ?? {
              kind: "monogram" as const,
              text: fallback.monogram,
              color: fallback.color,
            };
            const fallbackImage = Option.getOrNull(
              AsyncResult.value(get(desktopTaskProjectIconAtom(override))),
            );
            const logo = project.projectIcon
              ? null
              : get(
                  projectFaviconUrlAtom({
                    environmentId,
                    cwd: project.workspaceRoot,
                    faviconPath: project.faviconPath,
                  }),
                );
            return [project.id, logo?.startsWith("data:image/") ? logo : fallbackImage] as const;
          }),
      );
      tasks.push(
        ...projected.map((task) => ({
          ...task,
          projectIcon: icons.get(threadProjects.get(task.threadId)!) ?? null,
          requests: (() => {
            if (task.status !== "approval" && task.status !== "input") return [];
            const ref = { environmentId, threadId: task.threadId };
            const state = get(environmentThreadDetails.stateAtom(ref));
            if (state.status !== "live" || Option.isNone(state.data)) return [];
            return projectDesktopTaskRequests(state.data.value);
          })(),
        })),
      );
    }
    return sortDesktopTasks(tasks);
  }),
);

/** Mounted only in the macOS desktop renderer; shares its existing environment subscriptions. */
export function DesktopTaskActivityCoordinator() {
  const enabled = useClientSettings((settings) => settings.macTaskActivityEnabled);
  const displayId = useClientSettings((settings) => settings.macTaskActivityDisplayId);
  const hydrated = useClientSettingsHydrated();
  const tasks = useAtomValue(tasksAtom(hydrated && enabled));
  const navigate = useNavigate();
  const bridge = window.desktopBridge;
  const previous = useRef("");
  const currentTasks = useRef(tasks);
  useEffect(() => {
    currentTasks.current = tasks;
  }, [tasks]);
  const responsesInFlight = useRef(new Set<string>());
  const respondToApproval = useAtomCommand(threadEnvironment.respondToApproval, {
    reportFailure: false,
  });
  const respondToUserInput = useAtomCommand(threadEnvironment.respondToUserInput, {
    reportFailure: false,
  });
  const dismissUserInput = useAtomCommand(threadEnvironment.dismissUserInput, {
    reportFailure: false,
  });

  useEffect(
    () =>
      bridge?.onTaskActivityRespond?.((value) => {
        const decoded = decodeResponse(value);
        if (Option.isNone(decoded)) return;
        const response = decoded.value;
        const key = taskRequestKey(response);
        if (responsesInFlight.current.has(key)) return;
        const target = {
          environmentId: response.environmentId,
          threadId: response.threadId,
          requestId: response.requestId,
        };
        if (!validTaskResponse(currentTasks.current, response)) {
          void bridge.setTaskActivityResponseResult?.({
            ...target,
            error: "This request is no longer available. Open the chat to check its latest state.",
          });
          return;
        }
        responsesInFlight.current.add(key);
        void (async () => {
          let error: string | null = null;
          try {
            const command = {
              environmentId: response.environmentId,
              input: {
                threadId: response.threadId,
                requestId: response.requestId,
              },
            };
            const result =
              response.kind === "input"
                ? await respondToUserInput({
                    ...command,
                    input: { ...command.input, answers: response.answers },
                  })
                : response.kind === "approval"
                  ? await respondToApproval({
                      ...command,
                      input: { ...command.input, decision: response.decision },
                    })
                  : await dismissUserInput(command);
            if (result._tag === "Failure") {
              const failure = squashAtomCommandFailure(result);
              error =
                failure instanceof Error
                  ? failure.message
                  : "Could not send your response. Try again.";
            }
          } catch (failure) {
            error =
              failure instanceof Error
                ? failure.message
                : "Could not send your response. Try again.";
          } finally {
            responsesInFlight.current.delete(key);
          }
          await bridge.setTaskActivityResponseResult?.({ ...target, error });
        })().catch((error: unknown) =>
          console.warn("Could not return notch response status", error),
        );
      }),
    [bridge, respondToApproval, respondToUserInput, dismissUserInput],
  );

  useEffect(() => {
    return bridge?.onTaskActivityOpen?.(({ environmentId, threadId }) => {
      void navigate({ to: "/$environmentId/$threadId", params: { environmentId, threadId } });
    });
  }, [bridge, navigate]);

  // Equivalent shell updates (e.g. timestamps) must not wake the panel renderer.
  useEffect(() => {
    const activity = {
      enabled: hydrated && enabled,
      tasks: enabled ? tasks : [],
      displayId,
      appName: APP_EDITION_LABEL || APP_BASE_NAME,
    };
    const serialized = JSON.stringify(activity);
    if (previous.current === serialized) return;
    previous.current = serialized;
    void bridge?.setTaskActivity?.(activity).catch((error: unknown) => {
      previous.current = "";
      console.warn("Could not update desktop task activity", error);
    });
  }, [enabled, hydrated, tasks, displayId, bridge]);

  useEffect(() => {
    return () => {
      previous.current = "";
      void bridge?.setTaskActivity?.({ enabled: false, tasks: [] }).catch(() => undefined);
    };
  }, [bridge]);

  return null;
}
