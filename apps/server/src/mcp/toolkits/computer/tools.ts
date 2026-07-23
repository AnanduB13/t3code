import {
  ComputerUseAppList,
  ComputerUseAppState,
  ComputerUseAppTargetInput,
  ComputerUseClickInput,
  ComputerUseDevice,
  ComputerUseDeviceList,
  ComputerUseDragInput,
  ComputerUseError,
  ComputerUseMoveInput,
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
const navigationAction = <T extends Tool.Any>(tool: T): T =>
  tool
    .annotate(Tool.OpenWorld, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true) as T;

export const ComputerListDevicesTool = readonly(
  Tool.make("computer_list_devices", {
    description:
      "List real computers currently connected to this T3 Code backend, with human-readable names, permission status, and sessionIsolation. A shared session uses that login's real focus and pointer; an isolated session is safe for concurrent user work. Always call this before the first Computer Use action. If selectionRequired is true, ask which named device to use.",
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
    description:
      "List visible windows on the selected computer. Each result has an opaque stable windowId, exact title, focus state, and bounds. Select by windowId; never guess from a partial title when more than one window could match.",
    parameters: ComputerUseRefreshInput,
    success: ComputerUseAppList,
    failure: ComputerUseError,
    dependencies,
  }).annotate(Tool.Title, "List desktop applications"),
);

export const ComputerGetAppStateTool = readonly(
  Tool.make("computer_get_app_state", {
    description:
      "Observe one exact window before acting. Pass windowId from computer_list_apps. Returns a cropped PNG, a fresh observationId, a hierarchical accessibility tree with parent/depth, focus, enabled and interactive state, screenshot-relative rectangles, and explicit coordinate scaling. Use role + label + ancestry to understand navigation. The app title fallback is only for a unique exact match.",
    parameters: ComputerUseAppTargetInput,
    success: ComputerUseAppState,
    failure: ComputerUseError,
    dependencies,
  }).annotate(Tool.Title, "Observe desktop application"),
);

export const ComputerClickTool = action(
  Tool.make("computer_click", {
    description:
      "Click within the exact window from the latest observation. Pass its windowId and observationId, then either an enabled interactive accessibility elementIndex (preferred) or x/y pixels measured in that observation's cropped screenshot. The real OS cursor moves visibly to the target. The observation is single-use; observe again after the action.",
    parameters: ComputerUseClickInput,
    success: Schema.Null,
    failure: ComputerUseError,
    dependencies,
  }).annotate(Tool.Title, "Click desktop"),
);
export const ComputerMoveTool = navigationAction(
  Tool.make("computer_move", {
    description:
      "Move the real OS cursor visibly within the exact window from the latest observation without clicking. Pass windowId and observationId, then either elementIndex or x/y pixels from the cropped screenshot. Use only when hover is necessary to reveal a tooltip or control, then observe again.",
    parameters: ComputerUseMoveInput,
    success: Schema.Null,
    failure: ComputerUseError,
    dependencies,
  }).annotate(Tool.Title, "Move desktop cursor"),
);
export const ComputerDragTool = action(
  Tool.make("computer_drag", {
    description:
      "Drag between screenshot-relative points in one exact, freshly observed window. Pass windowId and observationId; observe again afterward.",
    parameters: ComputerUseDragInput,
    success: Schema.Null,
    failure: ComputerUseError,
    dependencies,
  }).annotate(Tool.Title, "Drag desktop"),
);
export const ComputerPressKeyTool = action(
  Tool.make("computer_press_key", {
    description:
      "Focus the exact window from a fresh observation and press a key, optionally with modifiers. Pass windowId and observationId; observe again afterward.",
    parameters: ComputerUsePressKeyInput,
    success: Schema.Null,
    failure: ComputerUseError,
    dependencies,
  }).annotate(Tool.Title, "Press desktop key"),
);
export const ComputerScrollTool = action(
  Tool.make("computer_scroll", {
    description:
      "Scroll the exact window from a fresh observation, optionally at x/y pixels in its cropped screenshot. Pass windowId and observationId; observe again afterward.",
    parameters: ComputerUseScrollInput,
    success: Schema.Null,
    failure: ComputerUseError,
    dependencies,
  }).annotate(Tool.Title, "Scroll desktop"),
);
export const ComputerTypeTextTool = action(
  Tool.make("computer_type_text", {
    description:
      "Focus the exact window from a fresh observation and type literal text into its focused control. Pass windowId and observationId and observe again afterward. Never type passwords, authentication secrets, or payment details; hand those steps to the user.",
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
  ComputerMoveTool,
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
  ComputerMoveTool,
  ComputerClickTool,
  ComputerDragTool,
  ComputerPressKeyTool,
  ComputerScrollTool,
  ComputerTypeTextTool,
);

export const ComputerUseSnapshotToolkit = Toolkit.make(ComputerGetAppStateTool);
