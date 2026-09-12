import {
  EnvironmentId,
  ThreadId,
  type ComputerUseRequest,
  type ComputerUseResponse,
  type ComputerUseStreamEvent,
} from "@t3tools/contracts";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";
import * as Cause from "effect/Cause";
import { describe, expect, it, vi } from "vite-plus/test";

import { createComputerUseRequestConsumerAtom } from "./computerUseRequestConsumer";
import { createSerializedAbortableExecutor } from "@t3tools/shared/serializedAbortableExecutor";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const threadId = ThreadId.make("thread-1");
const request = (requestId: string): ComputerUseRequest => ({
  requestId,
  threadId,
  operation: "listApps",
  input: {},
  timeoutMs: 20_000,
});
const requestEvent = (requestId: string, connectionId = "connection-1") =>
  ({
    type: "request",
    connectionId,
    request: request(requestId),
  }) satisfies ComputerUseStreamEvent;

describe("computerUseRequestConsumer", () => {
  it("cancels renderer-queued work before it is sent to the native bridge", async () => {
    const requestsAtom = Atom.make<AsyncResult.AsyncResult<ComputerUseStreamEvent, Error>>(
      AsyncResult.initial(false),
    );
    const gate = deferred();
    const started = deferred();
    const bridge = vi.fn(async (input: ComputerUseRequest) => {
      if (input.requestId === "first") {
        started.resolve();
        await gate.promise;
      }
    });
    const executor = createSerializedAbortableExecutor(bridge);
    const tasks: Promise<unknown>[] = [];
    const consumer = createComputerUseRequestConsumerAtom({
      requestsAtom,
      clientId: "client-1",
      label: "test:queued-cancel",
      requestHandlerAtom: Atom.make({
        handle: (input: ComputerUseRequest) => {
          const task = executor.execute(input.requestId, input);
          tasks.push(task);
          return task;
        },
        cancel: executor.cancel,
      }),
      respond: async () => undefined,
    });
    const registry = AtomRegistry.make();
    registry.mount(consumer);
    registry.set(requestsAtom, AsyncResult.success(requestEvent("first")));
    registry.set(requestsAtom, AsyncResult.success(requestEvent("queued")));
    await started.promise;
    registry.set(
      requestsAtom,
      AsyncResult.success({ type: "cancel", connectionId: "connection-1", requestId: "queued" }),
    );
    gate.resolve();
    await Promise.allSettled(tasks);
    expect(bridge.mock.calls.map(([input]) => input.requestId)).toEqual(["first"]);
    registry.dispose();
  });

  it.each(["reconnect", "disconnect"] as const)(
    "cancels old native work on %s and suppresses its late result",
    async (transition) => {
      const requestsAtom = Atom.make<AsyncResult.AsyncResult<ComputerUseStreamEvent, Error>>(
        AsyncResult.initial(false),
      );
      const gate = deferred();
      const handle = vi.fn(() => gate.promise);
      const cancel = vi.fn();
      const respond = vi.fn(async () => undefined);
      const consumer = createComputerUseRequestConsumerAtom({
        requestsAtom,
        clientId: "client-1",
        label: "test:connection-cancel",
        requestHandlerAtom: Atom.make({ handle, cancel }),
        respond,
      });
      const registry = AtomRegistry.make();
      registry.mount(consumer);
      registry.set(requestsAtom, AsyncResult.success(requestEvent("old")));
      registry.set(
        requestsAtom,
        transition === "reconnect"
          ? AsyncResult.success({ type: "connected", connectionId: "connection-2" })
          : AsyncResult.failure(Cause.fail(new Error("Disconnected"))),
      );
      expect(cancel).toHaveBeenCalledWith("old");
      gate.resolve();
      await gate.promise;
      expect(respond).not.toHaveBeenCalled();
      registry.dispose();
    },
  );

  it("consumes every request emitted before React can render", async () => {
    const requestsAtom = Atom.make<AsyncResult.AsyncResult<ComputerUseStreamEvent, Error>>(
      AsyncResult.initial(false),
    );
    const handle = vi.fn(async (input: ComputerUseRequest) => input.requestId);
    const responses: ComputerUseResponse[] = [];
    const consumer = createComputerUseRequestConsumerAtom({
      requestsAtom,
      clientId: "client-1",
      requestHandlerAtom: Atom.make({ handle, cancel: vi.fn() }),
      respond: async (response) => {
        responses.push(response);
      },
      label: "test:computer-use-consumer",
    });
    const registry = AtomRegistry.make();
    registry.mount(consumer);

    registry.set(requestsAtom, AsyncResult.success(requestEvent("request-1")));
    registry.set(requestsAtom, AsyncResult.success(requestEvent("request-2")));

    await vi.waitFor(() => expect(responses).toHaveLength(2));
    expect(handle.mock.calls.map(([value]) => value.requestId)).toEqual(["request-1", "request-2"]);
    registry.dispose();
  });

  it("ignores requests from a replaced connection", async () => {
    const requestsAtom = Atom.make(
      AsyncResult.success<ComputerUseStreamEvent, Error>({
        type: "connected",
        connectionId: "connection-2",
      }),
    );
    const handle = vi.fn(async () => undefined);
    const respond = vi.fn(async () => undefined);
    const consumer = createComputerUseRequestConsumerAtom({
      requestsAtom,
      clientId: "client-1",
      requestHandlerAtom: Atom.make({ handle, cancel: vi.fn() }),
      respond,
      label: `test:computer-use-consumer:${EnvironmentId.make("environment-1")}`,
    });
    const registry = AtomRegistry.make();
    registry.mount(consumer);
    registry.set(requestsAtom, AsyncResult.success(requestEvent("stale", "connection-1")));

    await Promise.resolve();
    expect(handle).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
    registry.dispose();
  });

  it("forwards cancellation only for the active host connection", async () => {
    const requestsAtom = Atom.make(
      AsyncResult.success<ComputerUseStreamEvent, Error>({
        type: "connected",
        connectionId: "connection-2",
      }),
    );
    const cancel = vi.fn();
    const consumer = createComputerUseRequestConsumerAtom({
      requestsAtom,
      clientId: "client-1",
      requestHandlerAtom: Atom.make({ handle: vi.fn(async () => undefined), cancel }),
      respond: vi.fn(async () => undefined),
      label: "test:computer-use-cancel",
    });
    const registry = AtomRegistry.make();
    registry.mount(consumer);
    registry.set(
      requestsAtom,
      AsyncResult.success({ type: "cancel", connectionId: "connection-1", requestId: "stale" }),
    );
    registry.set(
      requestsAtom,
      AsyncResult.success({ type: "cancel", connectionId: "connection-2", requestId: "active" }),
    );

    await vi.waitFor(() => expect(cancel).toHaveBeenCalledWith("active"));
    expect(cancel).not.toHaveBeenCalledWith("stale");
    registry.dispose();
  });

  it("cancels in-flight native work when the host connection unmounts", async () => {
    const requestsAtom = Atom.make<AsyncResult.AsyncResult<ComputerUseStreamEvent, Error>>(
      AsyncResult.initial(false),
    );
    let finish!: () => void;
    const handle = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const cancel = vi.fn();
    const consumer = createComputerUseRequestConsumerAtom({
      requestsAtom,
      clientId: "client-1",
      requestHandlerAtom: Atom.make({ handle, cancel }),
      respond: vi.fn(async () => undefined),
      label: "test:computer-use-dispose",
    });
    const registry = AtomRegistry.make();
    registry.mount(consumer);
    registry.set(requestsAtom, AsyncResult.success(requestEvent("in-flight")));
    await vi.waitFor(() => expect(handle).toHaveBeenCalledOnce());

    registry.dispose();

    expect(cancel).toHaveBeenCalledWith("in-flight");
    finish();
  });
});
