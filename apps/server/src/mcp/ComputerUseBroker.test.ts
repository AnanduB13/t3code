import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  ComputerUseDeviceSelectionRequiredError,
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
  type ComputerUseDevice,
  type ComputerUseHost,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as ComputerUseBroker from "./ComputerUseBroker.ts";

const scope = {
  environmentId: EnvironmentId.make("environment-computer-use"),
  threadId: ThreadId.make("thread-computer-use"),
  providerSessionId: "provider-session-computer-use",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set(["computerUse"] as const),
  issuedAt: 1,
  expiresAt: Number.MAX_SAFE_INTEGER,
};

const device = (deviceId: string, label: string): ComputerUseDevice => ({
  deviceId,
  label,
  platform: "linux",
  architecture: "x64",
  kind: "remote-desktop",
  sessionIsolation: "isolated",
  available: true,
  supportedOperations: ["listApps", "getAppState"],
});

const host = (clientId: string, target: ComputerUseDevice): ComputerUseHost => ({
  clientId,
  environmentId: scope.environmentId,
  device: target,
});

const makeBroker = ComputerUseBroker.make.pipe(Effect.provide(NodeServices.layer));

it.effect("requires the user-facing device choice when multiple desktops are connected", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const boxEvents = yield* broker.connect(host("client-box", device("box", "K11 NUCBox")));
      const laptopEvents = yield* broker.connect(
        host("client-laptop", device("laptop", "Anandu MacBook")),
      );
      yield* Stream.runDrain(boxEvents).pipe(Effect.forkScoped);
      yield* Stream.runDrain(laptopEvents).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const listed = yield* broker.listDevices(scope);
      expect(listed.selectionRequired).toBe(true);
      expect(listed.devices.map(({ label }) => label)).toEqual(["K11 NUCBox", "Anandu MacBook"]);

      const result = yield* Effect.result(
        broker.invoke<unknown>({ scope, operation: "listApps", input: {} }),
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(ComputerUseDeviceSelectionRequiredError);
      }
    }),
  ),
);

it.effect("keeps a provider session pinned to the selected named desktop", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const boxEvents = yield* broker.connect(host("client-box", device("box", "K11 NUCBox")));
      const laptopEvents = yield* broker.connect(
        host("client-laptop", device("laptop", "Anandu MacBook")),
      );
      const routed: string[] = [];
      const consume = (clientId: string, events: typeof boxEvents) =>
        Stream.runForEach(events, (event) => {
          if (event.type !== "request") return Effect.void;
          routed.push(clientId);
          return broker.respond({
            clientId,
            connectionId: event.connectionId,
            requestId: event.request.requestId,
            ok: true,
            result: { apps: [] },
          });
        });
      yield* consume("client-box", boxEvents).pipe(Effect.forkScoped);
      yield* consume("client-laptop", laptopEvents).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      yield* broker.selectDevice(scope, "laptop");
      yield* broker.invoke({ scope, operation: "listApps", input: {} });
      yield* broker.invoke({ scope, operation: "listApps", input: {} });

      expect(routed).toEqual(["client-laptop", "client-laptop"]);
    }),
  ),
);

it.effect("cancels host work when an invocation times out", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const events = yield* broker.connect(host("client-box", device("box", "K11 NUCBox")));
      const collected: Array<{ readonly type: string; readonly requestId?: string }> = [];
      const consumer = yield* Stream.runForEach(events, (event) => {
        collected.push(
          event.type === "cancel"
            ? { type: event.type, requestId: event.requestId }
            : { type: event.type },
        );
        return Effect.void;
      }).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const invocation = yield* broker
        .invoke({ scope, operation: "listApps", input: {}, timeoutMs: 1_000 })
        .pipe(Effect.result, Effect.forkScoped);
      yield* Effect.yieldNow;
      yield* TestClock.adjust("1 second");
      yield* Fiber.join(invocation);
      yield* Effect.yieldNow;

      expect(collected.map(({ type }) => type)).toEqual(["connected", "request", "cancel"]);
      expect(collected[2]?.requestId).toBe("computer-use-0");
      yield* Fiber.interrupt(consumer);
    }),
  ).pipe(Effect.provide(TestClock.layer())),
);

it.effect("cancels host work when the provider invocation is interrupted", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const events = yield* broker.connect(host("client-box", device("box", "K11 NUCBox")));
      const collected: Array<{ readonly type: string; readonly requestId?: string }> = [];
      yield* Stream.runForEach(events, (event) => {
        collected.push(
          event.type === "cancel"
            ? { type: event.type, requestId: event.requestId }
            : { type: event.type },
        );
        return Effect.void;
      }).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const invocation = yield* broker
        .invoke({ scope, operation: "listApps", input: {} })
        .pipe(Effect.forkScoped);
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(invocation);
      yield* Effect.yieldNow;

      expect(collected.map(({ type }) => type)).toEqual(["connected", "request", "cancel"]);
      expect(collected[2]?.requestId).toBe("computer-use-0");
    }),
  ),
);
