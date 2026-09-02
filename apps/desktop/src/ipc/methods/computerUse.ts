import {
  ComputerUseDevice,
  DesktopComputerUseCancelInput,
  DesktopComputerUseExecuteInput,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";

import * as DesktopIpc from "../DesktopIpc.ts";
import * as IpcChannels from "../channels.ts";
import {
  cancelAllComputerUse,
  cancelComputerUse,
  executeComputerUse,
  probeComputerUseDevice,
} from "../../computerUse/nativeComputerUse.ts";

export const describe = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.COMPUTER_USE_DESCRIBE_CHANNEL,
  payload: Schema.Struct({}),
  result: ComputerUseDevice,
  handler: () => Effect.promise(probeComputerUseDevice),
});

export const execute = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.COMPUTER_USE_EXECUTE_CHANNEL,
  payload: DesktopComputerUseExecuteInput,
  result: Schema.Unknown,
  handler: ({ requestId, operation, input }) =>
    Effect.tryPromise(() => executeComputerUse(requestId, operation, input)).pipe(Effect.orDie),
});

export const cancel = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.COMPUTER_USE_CANCEL_CHANNEL,
  payload: DesktopComputerUseCancelInput,
  result: Schema.Void,
  handler: ({ requestId }) => Effect.sync(() => cancelComputerUse(requestId)),
});

export const cancelAll = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.COMPUTER_USE_CANCEL_ALL_CHANNEL,
  payload: Schema.Struct({}),
  result: Schema.Void,
  handler: () => Effect.sync(cancelAllComputerUse),
});

export const methods = [describe, execute, cancel, cancelAll] as const;
