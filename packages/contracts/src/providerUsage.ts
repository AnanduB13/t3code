import * as Schema from "effect/Schema";

import { IsoDateTime, NonNegativeInt } from "./baseSchemas.ts";
import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";

export const ProviderUsageWindow = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  usedPercent: Schema.Number,
  remainingPercent: Schema.Number,
  resetsAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  windowDurationMins: Schema.optional(NonNegativeInt),
});
export type ProviderUsageWindow = typeof ProviderUsageWindow.Type;

export const ProviderUsageSnapshot = Schema.Struct({
  instanceId: ProviderInstanceId,
  provider: ProviderDriverKind,
  displayName: Schema.String,
  status: Schema.Literals(["available", "unavailable", "unsupported"]),
  windows: Schema.Array(ProviderUsageWindow),
  updatedAt: IsoDateTime,
  plan: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
});
export type ProviderUsageSnapshot = typeof ProviderUsageSnapshot.Type;

export const TokenUsageStats = Schema.Struct({
  lifetimeTokens: NonNegativeInt,
  peakThreadTokens: NonNegativeInt,
  trackedThreads: NonNegativeInt,
  daily: Schema.Array(
    Schema.Struct({
      date: Schema.String,
      tokens: NonNegativeInt,
    }),
  ),
});
export type TokenUsageStats = typeof TokenUsageStats.Type;

export const ProviderUsageResult = Schema.Struct({
  providers: Schema.Array(ProviderUsageSnapshot),
  tokenUsage: TokenUsageStats,
});
export type ProviderUsageResult = typeof ProviderUsageResult.Type;

export class ProviderUsageError extends Schema.TaggedErrorClass<ProviderUsageError>()(
  "ProviderUsageError",
  { message: Schema.String },
) {}

export function unavailableProviderUsage(input: {
  readonly instanceId: ProviderInstanceId;
  readonly provider: ProviderDriverKind;
  readonly displayName: string;
  readonly status?: "unavailable" | "unsupported";
  readonly message: string;
  readonly updatedAt: string;
}): ProviderUsageSnapshot {
  return {
    ...input,
    status: input.status ?? "unavailable",
    windows: [],
    updatedAt: input.updatedAt as ProviderUsageSnapshot["updatedAt"],
  };
}
