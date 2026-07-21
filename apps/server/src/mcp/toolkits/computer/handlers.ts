import type { ComputerUseAppList, ComputerUseAppState } from "@t3tools/contracts";
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
  computer_click: (input) => invoke<void>("click", input).pipe(Effect.as(null)),
  computer_drag: (input) => invoke<void>("drag", input).pipe(Effect.as(null)),
  computer_press_key: (input) => invoke<void>("pressKey", input).pipe(Effect.as(null)),
  computer_scroll: (input) => invoke<void>("scroll", input).pipe(Effect.as(null)),
  computer_type_text: (input) => invoke<void>("typeText", input).pipe(Effect.as(null)),
} satisfies Parameters<typeof ComputerUseToolkit.toLayer>[0];

const { computer_get_app_state, ...standardHandlers } = handlers;
export const ComputerUseStandardToolkitHandlersLive =
  ComputerUseStandardToolkit.toLayer(standardHandlers);
export const ComputerUseSnapshotToolkitHandlersLive = ComputerUseSnapshotToolkit.toLayer({
  computer_get_app_state,
});
export const ComputerUseToolkitHandlersLive = ComputerUseToolkit.toLayer(handlers);
