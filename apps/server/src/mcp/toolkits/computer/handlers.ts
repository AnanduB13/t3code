import type {
  ComputerUseActionResult,
  ComputerUseAppList,
  ComputerUseAppState,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as ComputerUseBroker from "../../ComputerUseBroker.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
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

const handlers = {
  computer_list_devices: () =>
    context().pipe(Effect.flatMap(({ scope, broker }) => broker.listDevices(scope))),
  computer_select_device: ({ deviceId }) =>
    context().pipe(Effect.flatMap(({ scope, broker }) => broker.selectDevice(scope, deviceId))),
  computer_list_apps: () => invoke<ComputerUseAppList>("listApps", {}),
  computer_get_app_state: (input) => invoke<ComputerUseAppState>("getAppState", input),
  computer_move: (input) => invoke<ComputerUseActionResult>("move", input),
  computer_click: (input) => invoke<ComputerUseActionResult>("click", input),
  computer_drag: (input) => invoke<ComputerUseActionResult>("drag", input),
  computer_press_key: (input) => invoke<ComputerUseActionResult>("pressKey", input),
  computer_scroll: (input) => invoke<ComputerUseActionResult>("scroll", input),
  computer_type_text: (input) => invoke<ComputerUseActionResult>("typeText", input),
} satisfies Parameters<typeof ComputerUseToolkit.toLayer>[0];

const { computer_list_devices, computer_select_device, computer_list_apps, ...snapshotHandlers } =
  handlers;
export const ComputerUseStandardToolkitHandlersLive = ComputerUseStandardToolkit.toLayer({
  computer_list_devices,
  computer_select_device,
  computer_list_apps,
});
export const ComputerUseSnapshotToolkitHandlersLive =
  ComputerUseSnapshotToolkit.toLayer(snapshotHandlers);
export const ComputerUseToolkitHandlersLive = ComputerUseToolkit.toLayer(handlers);
