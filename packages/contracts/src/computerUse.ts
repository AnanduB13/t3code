import * as Schema from "effect/Schema";

import { EnvironmentId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

export const COMPUTER_USE_OPERATIONS = [
  "listApps",
  "getAppState",
  "move",
  "click",
  "drag",
  "pressKey",
  "scroll",
  "typeText",
] as const;

export const ComputerUseOperation = Schema.Literals(COMPUTER_USE_OPERATIONS);
export type ComputerUseOperation = typeof ComputerUseOperation.Type;

export const ComputerUseDeviceId = TrimmedNonEmptyString.check(Schema.isMaxLength(256));
export type ComputerUseDeviceId = typeof ComputerUseDeviceId.Type;

export const ComputerUseDevice = Schema.Struct({
  deviceId: ComputerUseDeviceId,
  label: TrimmedNonEmptyString.check(Schema.isMaxLength(128)),
  platform: Schema.Literals(["macos", "windows", "linux"]),
  architecture: TrimmedNonEmptyString.check(Schema.isMaxLength(32)),
  kind: Schema.Literals(["backend-device", "prompting-device", "remote-desktop"]),
  sessionIsolation: Schema.Literals(["shared", "isolated"]),
  platformSupport: Schema.optional(Schema.Literals(["verified", "experimental"])),
  available: Schema.Boolean,
  unavailableReason: Schema.optional(Schema.String),
  supportedOperations: Schema.Array(ComputerUseOperation),
});
export type ComputerUseDevice = typeof ComputerUseDevice.Type;

export const ComputerUseDeviceList = Schema.Struct({
  devices: Schema.Array(ComputerUseDevice),
  selectedDeviceId: Schema.NullOr(ComputerUseDeviceId),
  selectionRequired: Schema.Boolean,
});
export type ComputerUseDeviceList = typeof ComputerUseDeviceList.Type;

export const ComputerUseSelectDeviceInput = Schema.Struct({ deviceId: ComputerUseDeviceId });
const ComputerUseWindowId = TrimmedNonEmptyString.check(Schema.isMaxLength(256));
const ComputerUseObservationId = TrimmedNonEmptyString.check(Schema.isMaxLength(256));
export const ComputerUseAppTargetInput = Schema.Struct({
  windowId: Schema.optional(ComputerUseWindowId),
  app: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(512))),
});
const ComputerUseObservedWindowInput = {
  windowId: ComputerUseWindowId,
  observationId: ComputerUseObservationId,
};
const ComputerUsePointerTargetInput = {
  elementIndex: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  x: Schema.optional(Schema.Finite),
  y: Schema.optional(Schema.Finite),
};
const validatePointerTarget = Schema.makeFilter(
  (input: {
    readonly elementIndex?: number | undefined;
    readonly x?: number | undefined;
    readonly y?: number | undefined;
  }) => {
    const hasElement = input.elementIndex !== undefined;
    const hasX = input.x !== undefined;
    const hasY = input.y !== undefined;
    if (hasX !== hasY) return "Coordinates require both x and y.";
    return hasElement !== (hasX && hasY) || "Provide exactly one pointer target.";
  },
);
export const ComputerUseClickInput = Schema.Struct({
  ...ComputerUseObservedWindowInput,
  ...ComputerUsePointerTargetInput,
  mouseButton: Schema.optional(Schema.Literals(["left", "right", "middle"])),
  clickCount: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3 }))),
}).check(validatePointerTarget);
export const ComputerUseMoveInput = Schema.Struct({
  ...ComputerUseObservedWindowInput,
  ...ComputerUsePointerTargetInput,
}).check(validatePointerTarget);
export const ComputerUseDragInput = Schema.Struct({
  ...ComputerUseObservedWindowInput,
  fromX: Schema.Finite,
  fromY: Schema.Finite,
  toX: Schema.Finite,
  toY: Schema.Finite,
});
export const ComputerUsePressKeyInput = Schema.Struct({
  ...ComputerUseObservedWindowInput,
  key: TrimmedNonEmptyString,
  modifiers: Schema.optional(Schema.Array(Schema.Literals(["Alt", "Control", "Meta", "Shift"]))),
});
export const ComputerUseScrollInput = Schema.Struct({
  ...ComputerUseObservedWindowInput,
  x: Schema.optional(Schema.Finite),
  y: Schema.optional(Schema.Finite),
  deltaX: Schema.optional(Schema.Finite),
  deltaY: Schema.optional(Schema.Finite),
}).check(
  Schema.makeFilter((input) => {
    if ((input.x === undefined) !== (input.y === undefined)) {
      return "Scroll coordinates require both x and y.";
    }
    return input.deltaX !== undefined || input.deltaY !== undefined || "Provide a scroll delta.";
  }),
);
export const ComputerUseTypeTextInput = Schema.Struct({
  ...ComputerUseObservedWindowInput,
  text: Schema.String.check(Schema.isMaxLength(32_000)),
});

export const ComputerUseApp = Schema.Struct({
  windowId: ComputerUseWindowId,
  index: Schema.Int,
  title: Schema.String,
  focused: Schema.Boolean,
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
});
export const ComputerUseAppList = Schema.Struct({ apps: Schema.Array(ComputerUseApp) });
export type ComputerUseAppList = typeof ComputerUseAppList.Type;

export const ComputerUseElement = Schema.Struct({
  index: Schema.Int,
  depth: Schema.Int,
  parentIndex: Schema.optional(Schema.Int),
  role: Schema.optional(Schema.String),
  subRole: Schema.optional(Schema.String),
  label: Schema.optional(Schema.String),
  value: Schema.optional(Schema.String),
  selectedText: Schema.optional(Schema.String),
  focused: Schema.optional(Schema.Boolean),
  enabled: Schema.optional(Schema.Boolean),
  interactive: Schema.Boolean,
  x: Schema.optional(Schema.Number),
  y: Schema.optional(Schema.Number),
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
});
export type ComputerUseElement = typeof ComputerUseElement.Type;
export const ComputerUseAppState = Schema.Struct({
  app: Schema.String,
  windowId: ComputerUseWindowId,
  observationId: ComputerUseObservationId,
  text: Schema.String,
  elements: Schema.Array(ComputerUseElement),
  navigation: Schema.Struct({
    focusedElementIndex: Schema.NullOr(Schema.Int),
    interactiveElementIndices: Schema.Array(Schema.Int),
  }),
  coordinateSpace: Schema.Struct({
    kind: Schema.Literal("window-screenshot"),
    screenX: Schema.Number,
    screenY: Schema.Number,
    logicalWidth: Schema.Number,
    logicalHeight: Schema.Number,
    screenshotWidth: Schema.Int,
    screenshotHeight: Schema.Int,
    scaleX: Schema.Number,
    scaleY: Schema.Number,
  }),
  screenshot: Schema.Struct({
    mimeType: Schema.Literal("image/png"),
    data: Schema.String,
    width: Schema.Int,
    height: Schema.Int,
  }),
});
export type ComputerUseAppState = typeof ComputerUseAppState.Type;

export const ComputerUseClientId = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
export const ComputerUseConnectionId = TrimmedNonEmptyString.check(Schema.isMaxLength(64));
export const ComputerUseHost = Schema.Struct({
  clientId: ComputerUseClientId,
  environmentId: EnvironmentId,
  device: ComputerUseDevice,
});
export type ComputerUseHost = typeof ComputerUseHost.Type;

export const ComputerUseRequest = Schema.Struct({
  requestId: TrimmedNonEmptyString,
  threadId: ThreadId,
  operation: ComputerUseOperation,
  input: Schema.Unknown,
  timeoutMs: Schema.Int.check(Schema.isGreaterThan(0)),
});
export type ComputerUseRequest = typeof ComputerUseRequest.Type;

export const ComputerUseStreamEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("connected"), connectionId: ComputerUseConnectionId }),
  Schema.Struct({
    type: Schema.Literal("request"),
    connectionId: ComputerUseConnectionId,
    request: ComputerUseRequest,
  }),
  Schema.Struct({
    type: Schema.Literal("cancel"),
    connectionId: ComputerUseConnectionId,
    requestId: TrimmedNonEmptyString,
  }),
]);
export type ComputerUseStreamEvent = typeof ComputerUseStreamEvent.Type;

export const ComputerUseResponse = Schema.Struct({
  clientId: ComputerUseClientId,
  connectionId: ComputerUseConnectionId,
  requestId: TrimmedNonEmptyString,
  ok: Schema.Boolean,
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Struct({ _tag: TrimmedNonEmptyString, message: Schema.String })),
});
export type ComputerUseResponse = typeof ComputerUseResponse.Type;

const ScopeFields = {
  environmentId: EnvironmentId,
  threadId: ThreadId,
  providerSessionId: TrimmedNonEmptyString,
  providerInstanceId: ProviderInstanceId,
};

export class ComputerUseUnavailableError extends Schema.TaggedErrorClass<ComputerUseUnavailableError>()(
  "ComputerUseUnavailableError",
  { ...ScopeFields, reason: Schema.String },
) {}
export class ComputerUseDeviceSelectionRequiredError extends Schema.TaggedErrorClass<ComputerUseDeviceSelectionRequiredError>()(
  "ComputerUseDeviceSelectionRequiredError",
  { ...ScopeFields, devices: Schema.Array(ComputerUseDevice) },
) {}
export class ComputerUseDeviceNotFoundError extends Schema.TaggedErrorClass<ComputerUseDeviceNotFoundError>()(
  "ComputerUseDeviceNotFoundError",
  { ...ScopeFields, deviceId: ComputerUseDeviceId },
) {}
export class ComputerUseExecutionError extends Schema.TaggedErrorClass<ComputerUseExecutionError>()(
  "ComputerUseExecutionError",
  {
    ...ScopeFields,
    operation: ComputerUseOperation,
    deviceId: ComputerUseDeviceId,
    reason: Schema.String,
  },
) {}
export class ComputerUseTimeoutError extends Schema.TaggedErrorClass<ComputerUseTimeoutError>()(
  "ComputerUseTimeoutError",
  {
    ...ScopeFields,
    operation: ComputerUseOperation,
    deviceId: ComputerUseDeviceId,
    timeoutMs: Schema.Int,
  },
) {}

export const ComputerUseError = Schema.Union([
  ComputerUseUnavailableError,
  ComputerUseDeviceSelectionRequiredError,
  ComputerUseDeviceNotFoundError,
  ComputerUseExecutionError,
  ComputerUseTimeoutError,
]);
export type ComputerUseError = typeof ComputerUseError.Type;
