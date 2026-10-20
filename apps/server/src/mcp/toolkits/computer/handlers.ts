import type {
  ComputerUseActionResult,
  ComputerUseAppList,
  ComputerUseAppState,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as ComputerUseBroker from "../../ComputerUseBroker.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import {
  ComputerUseSnapshotToolkit,
  ComputerUseStandardToolkit,
  ComputerUseToolkit,
} from "./tools.ts";

const context = Effect.fn("ComputerUseToolkit.context")(function* () {
  const scope = yield* McpInvocationContext.requireComputerUseCapability();
  const broker = yield* ComputerUseBroker.ComputerUseBroker;
  return { scope, broker };
});

const invoke = Effect.fn("ComputerUseToolkit.invoke")(function* <A>(
  operation: import("@t3tools/contracts").ComputerUseOperation,
  input: unknown,
) {
  const { scope, broker } = yield* context();
  return yield* broker.invoke<A>({ scope, operation, input });
});

// Every handler checks the thread's computer-use capability itself, so access
// is declared as `reads`: no further caller checks apply.
const handlers = {
  computer_list_devices: McpToolAccess.reads(() =>
    context().pipe(Effect.flatMap(({ scope, broker }) => broker.listDevices(scope))),
  ),
  computer_select_device: McpToolAccess.reads(({ deviceId }) =>
    context().pipe(Effect.flatMap(({ scope, broker }) => broker.selectDevice(scope, deviceId))),
  ),
  computer_list_apps: McpToolAccess.reads(() => invoke<ComputerUseAppList>("listApps", {})),
  computer_get_app_state: McpToolAccess.reads((input) =>
    invoke<ComputerUseAppState>("getAppState", input),
  ),
  computer_move: McpToolAccess.reads((input) => invoke<ComputerUseActionResult>("move", input)),
  computer_click: McpToolAccess.reads((input) => invoke<ComputerUseActionResult>("click", input)),
  computer_drag: McpToolAccess.reads((input) => invoke<ComputerUseActionResult>("drag", input)),
  computer_press_key: McpToolAccess.reads((input) =>
    invoke<ComputerUseActionResult>("pressKey", input),
  ),
  computer_scroll: McpToolAccess.reads((input) => invoke<ComputerUseActionResult>("scroll", input)),
  computer_type_text: McpToolAccess.reads((input) =>
    invoke<ComputerUseActionResult>("typeText", input),
  ),
} satisfies McpToolAccess.Handlers<typeof ComputerUseToolkit.tools>;

const { computer_list_devices, computer_select_device, computer_list_apps, ...snapshotHandlers } =
  handlers;
export const ComputerUseStandardToolkitHandlersLive = McpToolAccess.toLayer(
  ComputerUseStandardToolkit,
  { computer_list_devices, computer_select_device, computer_list_apps },
);
export const ComputerUseSnapshotToolkitHandlersLive = McpToolAccess.toLayer(
  ComputerUseSnapshotToolkit,
  snapshotHandlers,
);
export const ComputerUseToolkitHandlersLive = McpToolAccess.toLayer(ComputerUseToolkit, handlers);
