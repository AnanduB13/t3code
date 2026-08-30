import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import type * as Types from "effect/Types";
import { McpProtocol, McpSchema, McpServer, Tool } from "effect/unstable/ai";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import packageJson from "../../package.json" with { type: "json" };
import * as McpInvocationContext from "./McpInvocationContext.ts";
import * as McpSessionRegistry from "./McpSessionRegistry.ts";
import * as PreviewAutomationBroker from "./PreviewAutomationBroker.ts";
import * as ComputerUseBroker from "./ComputerUseBroker.ts";
import {
  ComputerUseSnapshotToolkitHandlersLive,
  ComputerUseStandardToolkitHandlersLive,
} from "./toolkits/computer/handlers.ts";
import {
  ComputerGetAppStateTool,
  ComputerUseSnapshotToolkit,
  ComputerUseStandardToolkit,
} from "./toolkits/computer/tools.ts";
import {
  PreviewSnapshotToolkitHandlersLive,
  PreviewStandardToolkitHandlersLive,
  PreviewEvidenceToolkitHandlersLive,
} from "./toolkits/preview/handlers.ts";
import {
  PreviewCaptureEvidenceTool,
  PreviewEvidenceToolkit,
  PreviewSnapshotTool,
  PreviewSnapshotToolkit,
  PreviewStandardToolkit,
} from "./toolkits/preview/tools.ts";
import * as VisualEvidence from "../visualEvidence/VisualEvidence.ts";

const unauthorized = HttpServerResponse.jsonUnsafe(
  {
    error: "invalid_mcp_credential",
    message: "A valid provider-scoped MCP bearer credential is required.",
  },
  {
    status: 401,
    headers: {
      "cache-control": "no-store",
      "www-authenticate": "Bearer",
    },
  },
);

type AuthenticatedHttpEffect = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  Types.unhandled,
  McpInvocationContext.McpInvocationContext
>;

type McpAuthMiddleware = (
  httpEffect: AuthenticatedHttpEffect,
) => Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  Types.unhandled,
  HttpServerRequest.HttpServerRequest
>;

export const normalizeMcpHttpResponse = (
  response: HttpServerResponse.HttpServerResponse,
): HttpServerResponse.HttpServerResponse => {
  const bodyIsEmpty =
    response.body._tag === "Empty" ||
    (response.body._tag === "Uint8Array" && response.body.contentLength === 0) ||
    (response.body._tag === "Raw" && response.body.contentLength === 0);
  return response.status === 200 && bodyIsEmpty
    ? HttpServerResponse.setStatus(response, 202)
    : response;
};

const makeMcpAuthMiddleware = McpSessionRegistry.McpSessionRegistry.pipe(
  Effect.map(
    (registry): McpAuthMiddleware =>
      Effect.fn("McpHttpServer.authenticateRequest")(function* (httpEffect) {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const authorization = request.headers.authorization;
        const token =
          authorization?.startsWith("Bearer ") === true
            ? authorization.slice("Bearer ".length).trim()
            : "";
        const invocation = yield* registry.resolve(token);
        if (!invocation) {
          // Without this the only symptom of a dead credential is the agent
          // quietly losing the whole `t3-code` toolkit for the rest of its
          // session, with nothing on the server to explain why.
          yield* Effect.logWarning("rejected MCP request with an unusable credential", {
            reason: token.length === 0 ? "missing_bearer_token" : "unknown_or_expired_token",
          });
          return unauthorized;
        }
        return yield* httpEffect.pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
          Effect.map(normalizeMcpHttpResponse),
        );
      }),
  ),
  Effect.withSpan("McpHttpServer.makeAuthMiddleware"),
);

const McpAuthMiddlewareLive = HttpRouter.middleware<{
  provides: McpInvocationContext.McpInvocationContext;
}>()(makeMcpAuthMiddleware).layer;

const imageToolFailure = <E>(
  cause: Cause.Cause<E>,
  input: { readonly operation: "snapshot" | "capture-evidence"; readonly message: string },
) => {
  if (Cause.hasInterrupts(cause) || cause.reasons.some(Cause.isDieReason)) {
    return Effect.failCause(cause).pipe(Effect.orDie);
  }
  const failures = cause.reasons.filter(Cause.isFailReason);
  const firstFailure = failures[0]?.error;
  const errorTag =
    typeof firstFailure === "object" &&
    firstFailure !== null &&
    "_tag" in firstFailure &&
    typeof firstFailure._tag === "string"
      ? firstFailure._tag
      : "PreviewSnapshotError";
  const result = new McpSchema.CallToolResult({
    isError: true,
    structuredContent: {
      error: {
        _tag: errorTag,
        operation: input.operation,
        failureCount: failures.length,
      },
    },
    content: [{ type: "text", text: input.message }],
  });
  return Effect.logWarning("preview image tool failed", {
    operation: input.operation,
    errorTag,
    failureCount: failures.length,
  }).pipe(Effect.as(result));
};

const registerPreviewSnapshot = Effect.fn("McpHttpServer.registerPreviewSnapshot")(function* () {
  const server = yield* McpServer.McpServer;
  const broker = yield* PreviewAutomationBroker.PreviewAutomationBroker;
  const built = yield* PreviewSnapshotToolkit;
  const tool = PreviewSnapshotTool;
  yield* server.addTool({
    tool: new McpSchema.Tool({
      name: tool.name,
      description: Tool.getDescription(tool),
      inputSchema: Tool.getJsonSchema(tool),
      annotations: {
        ...Context.getOption(tool.annotations, Tool.Title).pipe(
          Option.map((title) => ({ title })),
          Option.getOrUndefined,
        ),
        readOnlyHint: Context.get(tool.annotations, Tool.Readonly),
        destructiveHint: Context.get(tool.annotations, Tool.Destructive),
        idempotentHint: Context.get(tool.annotations, Tool.Idempotent),
        openWorldHint: Context.get(tool.annotations, Tool.OpenWorld),
      },
    }),
    annotations: tool.annotations,
    handle: (payload) =>
      Effect.withFiber((fiber) => {
        const invocation = Context.getUnsafe(
          fiber.context,
          McpInvocationContext.McpInvocationContext,
        );
        return built.handle("preview_snapshot", payload).pipe(
          Stream.unwrap,
          Stream.run(Sink.last()),
          Effect.flatMap(Effect.fromOption),
          Effect.provideService(PreviewAutomationBroker.PreviewAutomationBroker, broker),
          Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
          Effect.matchCauseEffect({
            onFailure: (cause) =>
              imageToolFailure(cause, {
                operation: "snapshot",
                message: "Preview snapshot failed.",
              }),
            onSuccess: ({ encodedResult }) => {
              const snapshot = encodedResult as {
                readonly screenshot: {
                  readonly mimeType: "image/png";
                  readonly data: string;
                  readonly width: number;
                  readonly height: number;
                };
                readonly [key: string]: unknown;
              };
              const { screenshot, ...page } = snapshot;
              const metadata = {
                ...page,
                screenshot: {
                  mimeType: screenshot.mimeType,
                  width: screenshot.width,
                  height: screenshot.height,
                },
              };
              return Effect.succeed(
                new McpSchema.CallToolResult({
                  isError: false,
                  structuredContent: metadata,
                  content: [
                    { type: "text", text: JSON.stringify(metadata) },
                    {
                      type: "image",
                      data: new Uint8Array(Buffer.from(screenshot.data, "base64")),
                      mimeType: screenshot.mimeType,
                    },
                  ],
                }),
              );
            },
          }),
        );
      }),
  });
});

const PreviewStandardToolkitRegistrationLive = McpServer.toolkit(PreviewStandardToolkit).pipe(
  Layer.provide(PreviewStandardToolkitHandlersLive),
);

const PreviewSnapshotRegistrationLive = Layer.effectDiscard(registerPreviewSnapshot()).pipe(
  Layer.provide(PreviewSnapshotToolkitHandlersLive),
);

const registerPreviewEvidence = Effect.fn("McpHttpServer.registerPreviewEvidence")(function* () {
  const server = yield* McpServer.McpServer;
  const visualEvidence = yield* VisualEvidence.VisualEvidence;
  const built = yield* PreviewEvidenceToolkit;
  const tool = PreviewCaptureEvidenceTool;
  yield* server.addTool({
    tool: new McpSchema.Tool({
      name: tool.name,
      description: Tool.getDescription(tool),
      inputSchema: Tool.getJsonSchema(tool),
      annotations: {
        ...Context.getOption(tool.annotations, Tool.Title).pipe(
          Option.map((title) => ({ title })),
          Option.getOrUndefined,
        ),
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    }),
    annotations: tool.annotations,
    handle: (payload) =>
      Effect.withFiber((fiber) => {
        const invocation = Context.getUnsafe(
          fiber.context,
          McpInvocationContext.McpInvocationContext,
        );
        return built.handle("preview_capture_evidence", payload).pipe(
          Stream.unwrap,
          Stream.run(Sink.last()),
          Effect.flatMap(Effect.fromOption),
          Effect.provideService(VisualEvidence.VisualEvidence, visualEvidence),
          Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
          Effect.matchCauseEffect({
            onFailure: (cause) =>
              imageToolFailure(cause, {
                operation: "capture-evidence",
                message: "Backend visual evidence capture failed.",
              }),
            onSuccess: ({ encodedResult }) => {
              const result = encodedResult as {
                readonly screenshot: { readonly mimeType: "image/jpeg"; readonly data: string };
                readonly [key: string]: unknown;
              };
              const { screenshot, ...metadata } = result;
              return Effect.succeed(
                new McpSchema.CallToolResult({
                  isError: false,
                  structuredContent: metadata,
                  content: [
                    { type: "text", text: JSON.stringify(metadata) },
                    {
                      type: "image",
                      data: new Uint8Array(Buffer.from(screenshot.data, "base64")),
                      mimeType: screenshot.mimeType,
                    },
                  ],
                }),
              );
            },
          }),
        );
      }),
  });
});

export const PreviewEvidenceRegistrationLive = Layer.effectDiscard(registerPreviewEvidence()).pipe(
  Layer.provide(PreviewEvidenceToolkitHandlersLive),
);

export const PreviewToolkitRegistrationLive = Layer.mergeAll(
  PreviewStandardToolkitRegistrationLive,
  PreviewSnapshotRegistrationLive,
);

const registerComputerUseSnapshot = Effect.fn("McpHttpServer.registerComputerUseSnapshot")(
  function* () {
    const server = yield* McpServer.McpServer;
    const broker = yield* ComputerUseBroker.ComputerUseBroker;
    const built = yield* ComputerUseSnapshotToolkit;
    const tool = ComputerGetAppStateTool;
    yield* server.addTool({
      tool: new McpSchema.Tool({
        name: tool.name,
        description: Tool.getDescription(tool),
        inputSchema: Tool.getJsonSchema(tool),
        annotations: {
          ...Context.getOption(tool.annotations, Tool.Title).pipe(
            Option.map((title) => ({ title })),
            Option.getOrUndefined,
          ),
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      }),
      annotations: tool.annotations,
      handle: (payload) =>
        Effect.withFiber((fiber) => {
          const invocation = Context.getUnsafe(
            fiber.context,
            McpInvocationContext.McpInvocationContext,
          );
          return built.handle("computer_get_app_state", payload).pipe(
            Stream.unwrap,
            Stream.run(Sink.last()),
            Effect.flatMap(Effect.fromOption),
            Effect.provideService(ComputerUseBroker.ComputerUseBroker, broker),
            Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
            Effect.matchCauseEffect({
              onFailure: (cause) => {
                const firstFailure = cause.reasons.find(Cause.isFailReason)?.error;
                const errorTag =
                  typeof firstFailure === "object" &&
                  firstFailure !== null &&
                  "_tag" in firstFailure &&
                  typeof firstFailure._tag === "string"
                    ? firstFailure._tag
                    : "ComputerUseSnapshotError";
                return Effect.succeed(
                  new McpSchema.CallToolResult({
                    isError: true,
                    structuredContent: { error: { _tag: errorTag } },
                    content: [{ type: "text", text: "Computer Use observation failed." }],
                  }),
                );
              },
              onSuccess: ({ encodedResult }) => {
                const state = encodedResult as {
                  readonly screenshot: {
                    readonly mimeType: "image/png";
                    readonly data: string;
                    readonly width: number;
                    readonly height: number;
                  };
                  readonly [key: string]: unknown;
                };
                const { screenshot, ...application } = state;
                const metadata = {
                  ...application,
                  screenshot: {
                    mimeType: screenshot.mimeType,
                    width: screenshot.width,
                    height: screenshot.height,
                  },
                };
                return Effect.succeed(
                  new McpSchema.CallToolResult({
                    isError: false,
                    structuredContent: metadata,
                    content: [
                      { type: "text", text: JSON.stringify(metadata) },
                      {
                        type: "image",
                        data: new Uint8Array(Buffer.from(screenshot.data, "base64")),
                        mimeType: screenshot.mimeType,
                      },
                    ],
                  }),
                );
              },
            }),
          );
        }),
    });
  },
);

const ComputerUseStandardRegistrationLive = McpServer.toolkit(ComputerUseStandardToolkit).pipe(
  Layer.provide(ComputerUseStandardToolkitHandlersLive),
);
const ComputerUseSnapshotRegistrationLive = Layer.effectDiscard(registerComputerUseSnapshot()).pipe(
  Layer.provide(ComputerUseSnapshotToolkitHandlersLive),
);
export const ComputerUseToolkitRegistrationLive = Layer.mergeAll(
  ComputerUseStandardRegistrationLive,
  ComputerUseSnapshotRegistrationLive,
);

const McpTransportLive = McpServer.layerHttp({
  name: "T3 Code",
  version: packageJson.version,
  path: "/mcp",
  protocols: [McpProtocol.v2025_06_18],
}).pipe(Layer.provide(McpAuthMiddlewareLive));

export const layer = Layer.mergeAll(
  PreviewToolkitRegistrationLive,
  PreviewEvidenceRegistrationLive.pipe(Layer.provide(VisualEvidence.layer)),
  ComputerUseToolkitRegistrationLive,
).pipe(Layer.provideMerge(McpTransportLive));
