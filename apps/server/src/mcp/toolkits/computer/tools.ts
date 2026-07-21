import {
  ComputerUseAppList,
  ComputerUseAppState,
  ComputerUseAppTargetInput,
  ComputerUseClickInput,
  ComputerUseDevice,
  ComputerUseDeviceList,
  ComputerUseDragInput,
  ComputerUseError,
  ComputerUsePressKeyInput,
  ComputerUseScrollInput,
  ComputerUseSelectDeviceInput,
  ComputerUseTypeTextInput,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as ComputerUseBroker from "../../ComputerUseBroker.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ComputerUseBroker.ComputerUseBroker,
];
// Effect's JSON-schema encoder currently collapses an entirely empty Struct to
// `{ type: "None" }`. OpenAI function tools require a top-level object schema,
// so zero-argument tools retain one harmless optional field.
const ComputerUseRefreshInput = Schema.Struct({
  refresh: Schema.optional(Schema.Boolean).annotate({
    description: "Set true to explicitly refresh the connected-device or application list.",
  }),
});
const readonly = <T extends Tool.Any>(tool: T): T =>
  tool
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true) as T;
const action = <T extends Tool.Any>(tool: T): T =>
  tool.annotate(Tool.OpenWorld, true).annotate(Tool.Destructive, true) as T;

export const ComputerListDevicesTool = readonly(
  Tool.make("computer_list_devices", {
    description:
      "List real computers currently connected to this T3 Code backend, with their human-readable machine names and permission status. Always call this before the first Computer Use action. If selectionRequired is true, ask the user which named device to use and then call computer_select_device.",
    parameters: ComputerUseRefreshInput,
    success: ComputerUseDeviceList,
    failure: ComputerUseError,
    dependencies,
  }).annotate(Tool.Title, "List Computer Use devices"),
);

export const ComputerSelectDeviceTool = readonly(
  Tool.make("computer_select_device", {
    description:
      "Select the exact Computer Use device chosen by the user for this agent session. Do not choose on the user's behalf when multiple devices are listed.",
    parameters: ComputerUseSelectDeviceInput,
    success: ComputerUseDevice,
    failure: ComputerUseError,
    dependencies,
  }).annotate(Tool.Title, "Select Computer Use device"),
);

export const ComputerListAppsTool = readonly(
  Tool.make("computer_list_apps", {
    description: "List visible application windows on the selected computer.",
    parameters: ComputerUseRefreshInput,
    success: ComputerUseAppList,
    failure: ComputerUseError,
    dependencies,
  }).annotate(Tool.Title, "List desktop applications"),
);

export const ComputerGetAppStateTool = readonly(
  Tool.make("computer_get_app_state", {
    description:
      "Observe the selected computer before acting. Returns the selected application/window state, accessibility elements when available, and a PNG screenshot.",
    parameters: ComputerUseAppTargetInput,
    success: ComputerUseAppState,
    failure: ComputerUseError,
    dependencies,
  }).annotate(Tool.Title, "Observe desktop application"),
);

export const ComputerClickTool = action(
  Tool.make("computer_click", {
    description:
      "Click screen coordinates on the selected computer. Observe again after the action.",
    parameters: ComputerUseClickInput,
    success: Schema.Null,
    failure: ComputerUseError,
    dependencies,
  }).annotate(Tool.Title, "Click desktop"),
);
export const ComputerDragTool = action(
  Tool.make("computer_drag", {
    description: "Drag between screen coordinates on the selected computer.",
    parameters: ComputerUseDragInput,
    success: Schema.Null,
    failure: ComputerUseError,
    dependencies,
  }).annotate(Tool.Title, "Drag desktop"),
);
export const ComputerPressKeyTool = action(
  Tool.make("computer_press_key", {
    description: "Press a key, optionally with modifiers, on the selected computer.",
    parameters: ComputerUsePressKeyInput,
    success: Schema.Null,
    failure: ComputerUseError,
    dependencies,
  }).annotate(Tool.Title, "Press desktop key"),
);
export const ComputerScrollTool = action(
  Tool.make("computer_scroll", {
    description: "Scroll at an optional screen position on the selected computer.",
    parameters: ComputerUseScrollInput,
    success: Schema.Null,
    failure: ComputerUseError,
    dependencies,
  }).annotate(Tool.Title, "Scroll desktop"),
);
export const ComputerTypeTextTool = action(
  Tool.make("computer_type_text", {
    description:
      "Type literal text into the focused control on the selected computer. Never type passwords, authentication secrets, or payment details; hand those steps to the user.",
    parameters: ComputerUseTypeTextInput,
    success: Schema.Null,
    failure: ComputerUseError,
    dependencies,
  }).annotate(Tool.Title, "Type desktop text"),
);

export const ComputerUseToolkit = Toolkit.make(
  ComputerListDevicesTool,
  ComputerSelectDeviceTool,
  ComputerListAppsTool,
  ComputerGetAppStateTool,
  ComputerClickTool,
  ComputerDragTool,
  ComputerPressKeyTool,
  ComputerScrollTool,
  ComputerTypeTextTool,
);

export const ComputerUseStandardToolkit = Toolkit.make(
  ComputerListDevicesTool,
  ComputerSelectDeviceTool,
  ComputerListAppsTool,
  ComputerClickTool,
  ComputerDragTool,
  ComputerPressKeyTool,
  ComputerScrollTool,
  ComputerTypeTextTool,
);

export const ComputerUseSnapshotToolkit = Toolkit.make(ComputerGetAppStateTool);
