import { WsRpcGroup, WsProviderConsumeResetCreditRpc } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { RpcClient } from "effect/unstable/rpc";

// Reset redemption is offered only by newer servers that publish reset credits.
// Keep it out of this checkout's older server handler group.
export const makeWsRpcProtocolClient = RpcClient.make(
  WsRpcGroup.add(WsProviderConsumeResetCreditRpc),
);
type RpcClientFactory = typeof makeWsRpcProtocolClient;
export type WsRpcProtocolClient =
  RpcClientFactory extends Effect.Effect<infer Client, any, any> ? Client : never;
