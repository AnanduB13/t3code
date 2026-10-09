import type {
  ComputerUseHost,
  ComputerUseRequest,
  ComputerUseResponse,
  ComputerUseStreamEvent,
} from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";

type RequestStreamResult<E> = AsyncResult.AsyncResult<ComputerUseStreamEvent, E>;

export function createComputerUseRequestConsumerAtom<E>(options: {
  readonly requestsAtom: Atom.Atom<RequestStreamResult<E>>;
  readonly clientId: ComputerUseHost["clientId"];
  readonly requestHandlerAtom: Atom.Atom<{
    readonly handle: (request: ComputerUseRequest) => Promise<unknown>;
    readonly cancel: (requestId: string) => void;
  }>;
  readonly respond: (response: ComputerUseResponse) => Promise<unknown>;
  readonly label: string;
}): Atom.Atom<void> {
  return Atom.make((get) => {
    get.mount(options.requestHandlerAtom);
    let disposed = false;
    let activeConnectionId: ComputerUseStreamEvent["connectionId"] | null = null;
    let connectionExplicitlyAnnounced = false;
    let requestsVersion = 0;
    // Each in-flight request keeps the handler that started it, so cancelling
    // from the finalizer never reads the registry after it is disposed.
    const activeRequests = new Map<string, { readonly cancel: (requestId: string) => void }>();
    const cancelActiveRequests = () => {
      for (const [requestId, handler] of activeRequests) handler.cancel(requestId);
      activeRequests.clear();
    };

    const consume = (result: RequestStreamResult<E>) => {
      if (!AsyncResult.isSuccess(result)) {
        cancelActiveRequests();
        return;
      }
      const event = result.value;
      if (event.type === "connected") {
        if (activeConnectionId !== event.connectionId) cancelActiveRequests();
        activeConnectionId = event.connectionId;
        connectionExplicitlyAnnounced = true;
        return;
      }
      if (event.type === "cancel") {
        if (activeConnectionId === null) activeConnectionId = event.connectionId;
        if (activeConnectionId === event.connectionId) {
          get.once(options.requestHandlerAtom).cancel(event.requestId);
          activeRequests.delete(event.requestId);
        }
        return;
      }
      if (activeConnectionId === null) {
        activeConnectionId = event.connectionId;
      } else if (activeConnectionId !== event.connectionId) {
        if (connectionExplicitlyAnnounced) return;
        cancelActiveRequests();
        activeConnectionId = event.connectionId;
      }
      const request = event.request;
      if (activeRequests.has(request.requestId)) return;
      const handler = get.once(options.requestHandlerAtom);
      activeRequests.set(request.requestId, handler);
      const canRespond = () =>
        !disposed &&
        activeConnectionId === event.connectionId &&
        activeRequests.has(request.requestId);
      void handler
        .handle(request)
        .then(
          (result) =>
            canRespond()
              ? options.respond({
                  clientId: options.clientId,
                  connectionId: event.connectionId,
                  requestId: request.requestId,
                  ok: true,
                  ...(result === undefined ? {} : { result }),
                })
              : undefined,
          (cause) =>
            canRespond()
              ? options.respond({
                  clientId: options.clientId,
                  connectionId: event.connectionId,
                  requestId: request.requestId,
                  ok: false,
                  error: {
                    _tag: "ComputerUseNativeExecutionError",
                    message: cause instanceof Error ? cause.message : String(cause),
                  },
                })
              : undefined,
        )
        .catch((cause) => console.warn("Computer Use response could not be delivered", cause))
        .finally(() => {
          if (activeConnectionId === event.connectionId) activeRequests.delete(request.requestId);
        });
    };

    get.addFinalizer(() => {
      disposed = true;
      cancelActiveRequests();
    });
    const initialRequest = get.once(options.requestsAtom);
    if (AsyncResult.isSuccess(initialRequest) && initialRequest.value.type === "connected") {
      activeConnectionId = initialRequest.value.connectionId;
      connectionExplicitlyAnnounced = true;
    }
    get.subscribe(options.requestsAtom, (result) => {
      requestsVersion += 1;
      consume(result);
    });
    queueMicrotask(() => {
      if (!disposed && requestsVersion === 0) consume(initialRequest);
    });
  }).pipe(Atom.setIdleTTL(0), Atom.withLabel(options.label));
}
