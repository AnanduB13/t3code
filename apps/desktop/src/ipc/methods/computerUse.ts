import { ComputerUseDevice, DesktopComputerUseExecuteInput } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";

import * as DesktopIpc from "../DesktopIpc.ts";
import * as IpcChannels from "../channels.ts";
import {
  describeComputerUseDevice,
  executeComputerUse,
} from "../../computerUse/nativeComputerUse.ts";

export const describe = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.COMPUTER_USE_DESCRIBE_CHANNEL,
  payload: Schema.Struct({}),
  result: ComputerUseDevice,
  handler: () => Effect.sync(describeComputerUseDevice),
});

export const execute = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.COMPUTER_USE_EXECUTE_CHANNEL,
  payload: DesktopComputerUseExecuteInput,
  result: Schema.Unknown,
  handler: ({ operation, input }) =>
    Effect.tryPromise(() => executeComputerUse(operation, input)).pipe(Effect.orDie),
});

export const methods = [describe, execute] as const;
