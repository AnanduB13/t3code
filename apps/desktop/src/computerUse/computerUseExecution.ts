export interface SerializedAbortableExecutor<Input, Output> {
  readonly execute: (requestId: string, input: Input) => Promise<Output>;
  readonly cancel: (requestId: string) => void;
  readonly cancelAll: () => void;
}

/** Serializes native input while retaining cancellation for queued and active requests. */
export function createSerializedAbortableExecutor<Input, Output>(
  run: (input: Input, signal: AbortSignal) => Promise<Output>,
): SerializedAbortableExecutor<Input, Output> {
  let tail: Promise<void> = Promise.resolve();
  const controllers = new Map<string, AbortController>();

  const execute = (requestId: string, input: Input): Promise<Output> => {
    controllers.get(requestId)?.abort();
    const controller = new AbortController();
    controllers.set(requestId, controller);
    const result = tail.then(
      () => run(input, controller.signal),
      () => run(input, controller.signal),
    );
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result.finally(() => {
      if (controllers.get(requestId) === controller) controllers.delete(requestId);
    });
  };

  return {
    execute,
    cancel: (requestId) => controllers.get(requestId)?.abort(),
    cancelAll: () => {
      for (const controller of controllers.values()) controller.abort();
    },
  };
}
