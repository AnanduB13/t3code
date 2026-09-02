import {
  ComputerUseDeviceNotFoundError,
  ComputerUseDeviceSelectionRequiredError,
  ComputerUseExecutionError,
  ComputerUseTimeoutError,
  ComputerUseUnavailableError,
  type ComputerUseDevice,
  type ComputerUseDeviceList,
  type ComputerUseError,
  type ComputerUseHost,
  type ComputerUseOperation,
  type ComputerUseResponse,
  type ComputerUseStreamEvent,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SynchronizedRef from "effect/SynchronizedRef";

import type * as McpInvocationContext from "./McpInvocationContext.ts";

type Scope = McpInvocationContext.McpInvocationScope;

interface Connection {
  readonly host: ComputerUseHost;
  readonly connectionId: string;
  readonly queue: Queue.Queue<ComputerUseStreamEvent>;
}

interface Pending {
  readonly connection: Connection;
  readonly deferred: Deferred.Deferred<unknown, ComputerUseError>;
  readonly scope: Scope;
  readonly operation: ComputerUseOperation;
  readonly timeoutMs: number;
}

interface State {
  readonly clients: ReadonlyMap<string, Connection>;
  readonly selections: ReadonlyMap<string, string>;
  readonly pending: ReadonlyMap<string, Pending>;
  readonly sequence: number;
}

const selectionKey = (scope: Scope) => `${scope.environmentId}\u0000${scope.providerSessionId}`;
const scopeFields = (scope: Scope) => ({
  environmentId: scope.environmentId,
  threadId: scope.threadId,
  providerSessionId: scope.providerSessionId,
  providerInstanceId: scope.providerInstanceId,
});

export class ComputerUseBroker extends Context.Service<
  ComputerUseBroker,
  {
    readonly connect: (
      host: ComputerUseHost,
    ) => Effect.Effect<Stream.Stream<ComputerUseStreamEvent>>;
    readonly respond: (response: ComputerUseResponse) => Effect.Effect<void, ComputerUseError>;
    readonly listDevices: (scope: Scope) => Effect.Effect<ComputerUseDeviceList>;
    readonly selectDevice: (
      scope: Scope,
      deviceId: string,
    ) => Effect.Effect<ComputerUseDevice, ComputerUseError>;
    readonly invoke: <A>(input: {
      readonly scope: Scope;
      readonly operation: ComputerUseOperation;
      readonly input: unknown;
      readonly timeoutMs?: number;
    }) => Effect.Effect<A, ComputerUseError>;
  }
>()("t3/mcp/ComputerUseBroker") {}

export const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const state = yield* SynchronizedRef.make<State>({
    clients: new Map(),
    selections: new Map(),
    pending: new Map(),
    sequence: 0,
  });

  const removeConnection = Effect.fn("ComputerUseBroker.removeConnection")(function* (
    clientId: string,
    connection: Connection,
  ) {
    const pending = yield* SynchronizedRef.modify(state, (current) => {
      if (current.clients.get(clientId) !== connection) return [[] as Pending[], current] as const;
      const clients = new Map(current.clients);
      clients.delete(clientId);
      const nextPending = new Map(current.pending);
      const removed: Pending[] = [];
      for (const [requestId, entry] of nextPending) {
        if (entry.connection !== connection) continue;
        removed.push(entry);
        nextPending.delete(requestId);
      }
      return [removed, { ...current, clients, pending: nextPending }] as const;
    });
    yield* Effect.forEach(
      pending,
      (entry) =>
        Deferred.fail(
          entry.deferred,
          new ComputerUseUnavailableError({
            ...scopeFields(entry.scope),
            reason: `Computer Use device ${entry.connection.host.device.label} disconnected.`,
          }),
        ),
      { discard: true },
    );
    yield* Queue.shutdown(connection.queue);
  });

  const connect: ComputerUseBroker["Service"]["connect"] = Effect.fn("ComputerUseBroker.connect")(
    (host) =>
      Effect.succeed(
        Stream.unwrap(
          Effect.acquireRelease(
            Effect.gen(function* () {
              const queue = yield* Queue.unbounded<ComputerUseStreamEvent>();
              const connectionId = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
              const connection = { host, connectionId, queue } satisfies Connection;
              yield* Queue.offer(queue, { type: "connected", connectionId });
              const previous = yield* SynchronizedRef.modify(state, (current) => {
                const clients = new Map(current.clients);
                const old = clients.get(host.clientId);
                clients.set(host.clientId, connection);
                return [old, { ...current, clients }] as const;
              });
              if (previous) yield* removeConnection(host.clientId, previous);
              return connection;
            }),
            (connection) => removeConnection(host.clientId, connection),
          ).pipe(Effect.map((connection) => Stream.fromQueue(connection.queue))),
        ),
      ),
  );

  const availableConnections = (current: State, scope: Scope) =>
    Array.from(current.clients.values()).filter(
      ({ host }) => host.environmentId === scope.environmentId && host.device.available,
    );

  const listDevices: ComputerUseBroker["Service"]["listDevices"] = Effect.fn(
    "ComputerUseBroker.listDevices",
  )(function* (scope) {
    const current = yield* SynchronizedRef.get(state);
    const devices = Array.from(current.clients.values())
      .filter(({ host }) => host.environmentId === scope.environmentId)
      .map(({ host }) => host.device);
    const availableDevices = devices.filter(({ available }) => available);
    const selected = current.selections.get(selectionKey(scope));
    const selectedDeviceId = availableDevices.some((device) => device.deviceId === selected)
      ? selected!
      : availableDevices.length === 1
        ? availableDevices[0]!.deviceId
        : null;
    return {
      devices,
      selectedDeviceId,
      selectionRequired: availableDevices.length > 1 && !selectedDeviceId,
    };
  });

  const selectDevice: ComputerUseBroker["Service"]["selectDevice"] = Effect.fn(
    "ComputerUseBroker.selectDevice",
  )(function* (scope, deviceId) {
    const selected = yield* SynchronizedRef.modify(state, (current) => {
      const connection = availableConnections(current, scope).find(
        ({ host }) => host.device.deviceId === deviceId,
      );
      if (!connection) return [undefined, current] as const;
      const selections = new Map(current.selections);
      selections.set(selectionKey(scope), deviceId);
      return [connection.host.device, { ...current, selections }] as const;
    });
    if (!selected) {
      return yield* new ComputerUseDeviceNotFoundError({ ...scopeFields(scope), deviceId });
    }
    return selected;
  });

  const respond: ComputerUseBroker["Service"]["respond"] = Effect.fn("ComputerUseBroker.respond")(
    function* (response) {
      const pending = yield* SynchronizedRef.modify(state, (current) => {
        const entry = current.pending.get(response.requestId);
        if (
          !entry ||
          entry.connection.host.clientId !== response.clientId ||
          entry.connection.connectionId !== response.connectionId
        ) {
          return [undefined, current] as const;
        }
        const next = new Map(current.pending);
        next.delete(response.requestId);
        return [entry, { ...current, pending: next }] as const;
      });
      if (!pending) return;
      if (response.ok) return yield* Deferred.succeed(pending.deferred, response.result);
      return yield* Deferred.fail(
        pending.deferred,
        new ComputerUseExecutionError({
          ...scopeFields(pending.scope),
          operation: pending.operation,
          deviceId: pending.connection.host.device.deviceId,
          reason: response.error?.message ?? "The desktop host returned an invalid response.",
        }),
      );
    },
  );

  interface Route {
    readonly connections: Connection[];
    readonly selectedId: string | undefined;
    readonly connection: Connection | undefined;
    readonly requestId: string | undefined;
  }

  const invoke = Effect.fn("ComputerUseBroker.invoke")(function* <A = unknown>(
    request: Parameters<ComputerUseBroker["Service"]["invoke"]>[0],
  ): Effect.fn.Return<A, ComputerUseError> {
    const { scope, operation, input, timeoutMs = 20_000 } = request;
    const deferred = yield* Deferred.make<unknown, ComputerUseError>();
    const route = yield* SynchronizedRef.modify(state, (current): readonly [Route, State] => {
      const connections = availableConnections(current, scope).filter(({ host }) =>
        host.device.supportedOperations.includes(operation),
      );
      const selectedId = current.selections.get(selectionKey(scope));
      const connection = selectedId
        ? connections.find(({ host }) => host.device.deviceId === selectedId)
        : connections.length === 1
          ? connections[0]
          : undefined;
      if (!connection) {
        return [{ connections, selectedId, connection: undefined, requestId: undefined }, current];
      }
      const requestId = `computer-use-${current.sequence}`;
      const pending = new Map(current.pending);
      pending.set(requestId, { connection, deferred, scope, operation, timeoutMs });
      return [
        { connections, selectedId, connection, requestId },
        { ...current, pending, sequence: current.sequence + 1 },
      ] as const;
    });
    if (!route.connection) {
      if (route.connections.length > 1 && !route.selectedId) {
        return yield* new ComputerUseDeviceSelectionRequiredError({
          ...scopeFields(scope),
          devices: route.connections.map(({ host }) => host.device),
        });
      }
      return yield* new ComputerUseUnavailableError({
        ...scopeFields(scope),
        reason:
          route.selectedId && route.connections.length === 0
            ? "The selected Computer Use device is disconnected or does not support this action."
            : "No Computer Use host is connected. Open T3 Code Desktop on the target device, enable Computer Use on this device in Settings → General, and grant screen/accessibility permissions.",
      });
    }
    const cleanup = SynchronizedRef.update(state, (current) => {
      const pending = new Map(current.pending);
      if (route.requestId) pending.delete(route.requestId);
      return { ...current, pending };
    });
    const requestId = route.requestId!;
    const connection = route.connection;
    const cancelHostRequest = Queue.offer(connection.queue, {
      type: "cancel" as const,
      connectionId: connection.connectionId,
      requestId,
    }).pipe(Effect.ignore);
    const offered = yield* Queue.offer(connection.queue, {
      type: "request",
      connectionId: connection.connectionId,
      request: { requestId, threadId: scope.threadId, operation, input, timeoutMs },
    });
    if (!offered) {
      yield* cleanup;
      return yield* new ComputerUseUnavailableError({
        ...scopeFields(scope),
        reason: `Computer Use device ${connection.host.device.label} disconnected.`,
      });
    }
    const result = yield* Deferred.await(deferred).pipe(
      Effect.timeoutOption(timeoutMs),
      Effect.onInterrupt(() => cancelHostRequest),
      Effect.ensuring(cleanup),
    );
    return yield* Option.match(result, {
      onNone: () =>
        Effect.gen(function* () {
          yield* cancelHostRequest;
          return yield* new ComputerUseTimeoutError({
            ...scopeFields(scope),
            operation,
            deviceId: connection.host.device.deviceId,
            timeoutMs,
          });
        }),
      onSome: (value) => Effect.succeed(value as A),
    });
  });

  return ComputerUseBroker.of({ connect, respond, listDevices, selectDevice, invoke });
});

export const layer = Layer.effect(ComputerUseBroker, make);
