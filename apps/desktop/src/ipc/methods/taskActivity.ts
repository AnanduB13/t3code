import { DesktopTaskActivity } from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { MacTaskActivity } from "../../activity/MacTaskActivity.ts";
import * as DesktopEnvironment from "../../app/DesktopEnvironment.ts";
import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import * as DesktopIpc from "../DesktopIpc.ts";
import { SET_TASK_ACTIVITY_CHANNEL } from "../channels.ts";

export const installTaskActivity = Effect.fn("desktop.ipc.installTaskActivity")(function* () {
  const platform = yield* HostProcessPlatform;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const path = yield* Path.Path;
  const ipc = yield* DesktopIpc.DesktopIpc;
  const windows = yield* ElectronWindow.ElectronWindow;
  const activity =
    platform === "darwin"
      ? yield* Effect.acquireRelease(
          Effect.sync(
            () => new MacTaskActivity(path.join(environment.dirname, "task-activity-preload.cjs")),
          ),
          (panel) => Effect.sync(() => panel.dispose()),
        )
      : undefined;
  yield* ipc.handle(
    DesktopIpc.makeIpcMethod({
      channel: SET_TASK_ACTIVITY_CHANNEL,
      payload: DesktopTaskActivity,
      result: Schema.Void,
      handler: Effect.fn("desktop.ipc.taskActivity.update")(function* (state, event) {
        const main = yield* windows.main;
        if (Option.isNone(main) || main.value.webContents.id !== event?.sender.id) return;
        yield* Effect.sync(() => activity?.update(state, main.value));
      }),
    }),
  );
});
