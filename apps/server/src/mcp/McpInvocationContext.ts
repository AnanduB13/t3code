import {
  ComputerUseUnavailableError,
  type EnvironmentId,
  PreviewAutomationUnavailableError,
  type ProviderInstanceId,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

export type McpCapability = "preview" | "computerUse";

export interface McpInvocationScope {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly providerSessionId: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly capabilities: ReadonlySet<McpCapability>;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export class McpInvocationContext extends Context.Service<
  McpInvocationContext,
  McpInvocationScope
>()("t3/mcp/McpInvocationContext") {}

export const requirePreviewCapability = Effect.fn("mcp.requirePreviewCapability")(function* () {
  const invocation = yield* McpInvocationContext;
  if (!invocation.capabilities.has("preview")) {
    return yield* new PreviewAutomationUnavailableError({
      capability: "preview",
      environmentId: invocation.environmentId,
      threadId: invocation.threadId,
      providerSessionId: invocation.providerSessionId,
      providerInstanceId: invocation.providerInstanceId,
    });
  }
  return invocation;
});

export const requireComputerUseCapability = Effect.fn("mcp.requireComputerUseCapability")(
  function* () {
    const invocation = yield* McpInvocationContext;
    if (!invocation.capabilities.has("computerUse")) {
      return yield* new ComputerUseUnavailableError({
        environmentId: invocation.environmentId,
        threadId: invocation.threadId,
        providerSessionId: invocation.providerSessionId,
        providerInstanceId: invocation.providerInstanceId,
        reason: "MCP credential does not grant the computerUse capability.",
      });
    }
    return invocation;
  },
);
