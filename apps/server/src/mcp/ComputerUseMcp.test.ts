import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
  type ComputerUseAppState,
} from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { McpSchema, McpServer } from "effect/unstable/ai";

import * as ComputerUseBroker from "./ComputerUseBroker.ts";
import * as McpHttpServer from "./McpHttpServer.ts";
import * as McpInvocationContext from "./McpInvocationContext.ts";
import { computerUseToolResult } from "./toolkits/computer/results.ts";

const invocation = {
  environmentId: EnvironmentId.make("computer-mcp-test"),
  threadId: ThreadId.make("computer-mcp-test"),
  providerInstanceId: ProviderInstanceId.make("codex"),
  providerSessionId: "test-session",
  capabilities: new Set(["computerUse"] as const),
  issuedAt: 1,
};
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  },
  getClient: Effect.die("unused"),
});
const TestLayer = McpHttpServer.ComputerUseToolkitRegistrationLive.pipe(
  Layer.provideMerge(McpServer.McpServer.layer),
  Layer.provideMerge(ComputerUseBroker.layer.pipe(Layer.provide(NodeServices.layer))),
);
const state: ComputerUseAppState = {
  app: "Editor",
  windowId: "window-1",
  observationId: "observation-2",
  text: '[0] AXButton label="Save"',
  elements: [{ index: 0, depth: 0, role: "AXButton", label: "Save", interactive: true }],
  navigation: { focusedElementIndex: null, interactiveElementIndices: [0] },
  coordinateSpace: {
    kind: "window-screenshot",
    screenX: 0,
    screenY: 0,
    logicalWidth: 800,
    logicalHeight: 600,
    screenshotWidth: 800,
    screenshotHeight: 600,
    scaleX: 1,
    scaleY: 1,
  },
  screenshot: {
    mimeType: "image/png",
    data: Buffer.from("image").toString("base64"),
    width: 800,
    height: 600,
  },
};

it("distinguishes a completed action with failed capture from a failed input", () => {
  const result = computerUseToolResult({
    actionCompleted: true,
    observationError: "Window closed",
  });
  expect(result.isError).toBe(false);
  expect(result.structuredContent).toEqual({
    actionCompleted: true,
    observationError: "Window closed",
  });
  expect(result.content).toHaveLength(1);
  expect(computerUseToolResult(null).content).toEqual([{ type: "text", text: "null" }]);
});

it.effect(
  "routes action observations through the broker and returns an image without base64 JSON or duplicate trees",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const server = yield* McpServer.McpServer;
        const broker = yield* ComputerUseBroker.ComputerUseBroker;
        const connected = yield* Deferred.make<void>();
        const events = yield* broker.connect({
          clientId: "host",
          environmentId: invocation.environmentId,
          device: {
            deviceId: "device",
            label: "Desktop",
            platform: "macos",
            architecture: "arm64",
            kind: "prompting-device",
            sessionIsolation: "shared",
            available: true,
            supportedOperations: ["click", "getAppState"],
          },
        });
        yield* Stream.runForEach(events, (event) => {
          if (event.type === "connected") return Deferred.succeed(connected, undefined);
          if (event.type !== "request") return Effect.void;
          expect(event.request.input).toMatchObject({ observeAfter: true });
          return broker.respond({
            clientId: "host",
            connectionId: event.connectionId,
            requestId: event.request.requestId,
            ok: true,
            result: { actionCompleted: true, observation: state },
          });
        }).pipe(Effect.forkScoped);
        yield* Deferred.await(connected);

        expect(server.tools.filter(({ tool }) => tool.name.startsWith("computer_")).length).toBe(
          10,
        );
        expect(
          server.tools.find(({ tool }) => tool.name === "computer_click")?.tool.annotations,
        ).toMatchObject({
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
        });
        expect(
          server.tools.find(({ tool }) => tool.name === "computer_get_app_state")?.tool.annotations,
        ).toMatchObject({
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
        });

        const result = yield* server
          .callTool({
            name: "computer_click",
            arguments: {
              windowId: "window-1",
              observationId: "observation-1",
              x: 20,
              y: 30,
              observeAfter: true,
            },
          })
          .pipe(
            Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
            Effect.provideService(McpSchema.McpServerClient, client),
          );
        expect(result.isError).toBe(false);
        expect(result.structuredContent).toMatchObject({
          actionCompleted: true,
          observation: { observationId: "observation-2" },
        });
        const text = result.content.find((content) => content.type === "text");
        expect(text?.type === "text" && text.text).toContain(state.text);
        expect(text?.type === "text" && text.text).not.toContain('"elements"');
        expect(result.structuredContent).not.toHaveProperty("observation.screenshot.data");
        const image = result.content.find((content) => content.type === "image");
        expect(image?.type === "image" && image.data).toEqual(new Uint8Array(Buffer.from("image")));
      }),
    ).pipe(Effect.provide(TestLayer)),
);

it.effect("preserves actionable native error messages in MCP responses", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      const broker = yield* ComputerUseBroker.ComputerUseBroker;
      const connected = yield* Deferred.make<void>();
      const events = yield* broker.connect({
        clientId: "host",
        environmentId: invocation.environmentId,
        device: {
          deviceId: "device",
          label: "Desktop",
          platform: "macos",
          architecture: "arm64",
          kind: "prompting-device",
          sessionIsolation: "shared",
          available: true,
          supportedOperations: ["getAppState"],
        },
      });
      yield* Stream.runForEach(events, (event) =>
        event.type === "connected"
          ? Deferred.succeed(connected, undefined)
          : event.type === "request"
            ? broker.respond({
                clientId: "host",
                connectionId: event.connectionId,
                requestId: event.request.requestId,
                ok: false,
                error: {
                  _tag: "NativeError",
                  message: "Window moved during capture. Observe again.",
                },
              })
            : Effect.void,
      ).pipe(Effect.forkScoped);
      yield* Deferred.await(connected);
      const result = yield* server
        .callTool({ name: "computer_get_app_state", arguments: { windowId: "window-1" } })
        .pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
          Effect.provideService(McpSchema.McpServerClient, client),
        );
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: "text", text: "Window moved during capture. Observe again." },
      ]);
    }),
  ).pipe(Effect.provide(TestLayer)),
);
