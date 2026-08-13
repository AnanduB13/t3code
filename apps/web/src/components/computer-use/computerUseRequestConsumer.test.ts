import {
  EnvironmentId,
  ThreadId,
  type ComputerUseRequest,
  type ComputerUseResponse,
  type ComputerUseStreamEvent,
} from "@t3tools/contracts";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import { createComputerUseRequestConsumerAtom } from "./computerUseRequestConsumer";

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
  it("consumes every request emitted before React can render", async () => {
    const requestsAtom = Atom.make<AsyncResult.AsyncResult<ComputerUseStreamEvent, Error>>(
      AsyncResult.initial(false),
    );
    const handle = vi.fn(async (input: ComputerUseRequest) => input.requestId);
    const responses: ComputerUseResponse[] = [];
    const consumer = createComputerUseRequestConsumerAtom({
      requestsAtom,
      clientId: "client-1",
      requestHandlerAtom: Atom.make({ handle }),
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
      requestHandlerAtom: Atom.make({ handle }),
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
});
