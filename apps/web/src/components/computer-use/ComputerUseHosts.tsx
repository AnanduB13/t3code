"use client";

import { useAtomValue } from "@effect/atom-react";
import type {
  ComputerUseDevice,
  ComputerUseHost,
  ComputerUseRequest,
  EnvironmentId,
} from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import { createSerializedAbortableExecutor } from "@t3tools/shared/serializedAbortableExecutor";
import { useGT } from "gt-react";
import { useEffect, useRef, useState } from "react";

import { isElectron } from "~/env";
import { useStableCallback } from "~/hooks/useStableCallback";
import { useEnvironments } from "~/state/environments";
import { computerUseEnvironment } from "~/state/computerUse";
import {
  useComputerUseAllowedEnvironmentIds,
  useComputerUseHostEnabled,
} from "~/state/computerUseHost";
import { useAtomCommand } from "~/state/use-atom-command";

import { ComputerUseMonitor } from "./ComputerUseMonitor";
import { createComputerUseRequestConsumerAtom } from "./computerUseRequestConsumer";
import {
  isComputerUseAppState,
  pointerForAction,
  type ComputerUseMonitorState,
} from "./computerUseMonitorState";

const makeClientId = () => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `computer-use-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
};

const desktopExecutor = createSerializedAbortableExecutor(
  (task: (signal: AbortSignal) => Promise<unknown>, signal) => task(signal),
);

export function ComputerUseHosts() {
  const gt = useGT();
  const { environments } = useEnvironments();
  const [hostEnabled, setHostEnabled] = useComputerUseHostEnabled();
  const [allowedEnvironmentIds, setAllowedEnvironmentIds] = useComputerUseAllowedEnvironmentIds();
  const allowedEnvironmentIdSet = new Set(allowedEnvironmentIds ?? []);
  const hostedEnvironments = environments.filter(({ environmentId }) =>
    allowedEnvironmentIdSet.has(environmentId),
  );
  const [monitor, setMonitor] = useState<ComputerUseMonitorState | null>(null);
  // Each enable starts a fresh hosting session: no stale monitor or device carries over.
  const [hostSession, setHostSession] = useState({ enabled: hostEnabled, epoch: 0 });
  if (hostSession.enabled !== hostEnabled) {
    setHostSession({ enabled: hostEnabled, epoch: hostSession.epoch + 1 });
    if (!hostEnabled) setMonitor(null);
  }
  const describeKey =
    hostEnabled && hostedEnvironments.length > 0
      ? `${hostSession.epoch}:${hostedEnvironments.length}`
      : null;
  const [described, setDescribed] = useState<{
    readonly key: string;
    readonly device: ComputerUseDevice;
  } | null>(null);
  const device = describeKey !== null && described?.key === describeKey ? described.device : null;
  const pointerSequence = useRef(0);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Seeds the persisted (localStorage) allow-list with every environment the first time the host is enabled.
  useEffect(() => {
    if (!hostEnabled || allowedEnvironmentIds !== null) return;
    setAllowedEnvironmentIds(environments.map(({ environmentId }) => environmentId));
  }, [allowedEnvironmentIds, environments, hostEnabled, setAllowedEnvironmentIds]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Asks the native desktop bridge to describe this machine while hosting.
  useEffect(() => {
    if (describeKey === null) return;
    let active = true;
    void window.desktopBridge?.computerUse?.describe().then((value) => {
      if (active) setDescribed({ key: describeKey, device: value });
    });
    return () => {
      active = false;
    };
  }, [describeKey]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Cancels in-flight native Computer Use actions when hosting is turned off.
  useEffect(() => {
    if (!hostEnabled) {
      desktopExecutor.cancelAll();
      void window.desktopBridge?.computerUse?.cancelAll();
    }
  }, [hostEnabled]);
  const deviceLabel = device?.label ?? gt("Desktop host");
  const sessionIsolation = device?.sessionIsolation ?? "shared";
  const onRequestStarted = (request: ComputerUseRequest) => {
    pointerSequence.current += 1;
    setMonitor((current) => {
      const pointer = pointerForAction(
        current?.observation,
        request.operation,
        request.input,
        pointerSequence.current,
      );
      return {
        deviceLabel,
        sessionIsolation,
        phase: request.operation === "getAppState" ? "capturing" : "acting",
        operation: request.operation,
        ...(current?.observation ? { observation: current.observation, app: current.app } : {}),
        ...(pointer ? { pointer } : current?.pointer ? { pointer: current.pointer } : {}),
      };
    });
  };
  const onRequestSucceeded = (request: ComputerUseRequest, result: unknown) => {
    setMonitor((current) => {
      const observation = isComputerUseAppState(result)
        ? result
        : typeof result === "object" &&
            result !== null &&
            "observation" in result &&
            isComputerUseAppState(result.observation)
          ? result.observation
          : undefined;
      if (observation) {
        return {
          deviceLabel,
          sessionIsolation,
          phase: "idle",
          operation: request.operation,
          app: observation.app,
          observation,
          message: gt("Latest application screenshot"),
        };
      }
      const observationError =
        typeof result === "object" &&
        result !== null &&
        "observationError" in result &&
        typeof result.observationError === "string"
          ? result.observationError
          : undefined;
      return current
        ? {
            ...current,
            phase: observationError ? "error" : "idle",
            message: observationError
              ? gt("{operation} completed. {error}", {
                  operation: request.operation,
                  error: observationError,
                })
              : gt("{operation} completed", { operation: request.operation }),
          }
        : current;
    });
  };
  const onRequestFailed = (request: ComputerUseRequest, cause: unknown) => {
    setMonitor((current) => ({
      deviceLabel,
      sessionIsolation,
      phase: "error",
      operation: request.operation,
      ...(current?.observation ? { observation: current.observation, app: current.app } : {}),
      ...(current?.pointer ? { pointer: current.pointer } : {}),
      message: cause instanceof Error ? cause.message : String(cause),
    }));
  };
  if (!isElectron || !window.desktopBridge?.computerUse || !device || !hostEnabled) return null;
  return (
    <>
      {hostedEnvironments.map(({ environmentId }) => (
        <ComputerUseHostConnection
          key={environmentId}
          environmentId={environmentId}
          device={device}
          onRequestStarted={onRequestStarted}
          onRequestSucceeded={onRequestSucceeded}
          onRequestFailed={onRequestFailed}
        />
      ))}
      <ComputerUseMonitor state={monitor} onStop={() => setHostEnabled(false)} />
    </>
  );
}

function ComputerUseHostConnection(props: {
  readonly environmentId: EnvironmentId;
  readonly device: ComputerUseDevice;
  readonly onRequestStarted: (request: ComputerUseRequest) => void;
  readonly onRequestSucceeded: (request: ComputerUseRequest, result: unknown) => void;
  readonly onRequestFailed: (request: ComputerUseRequest, cause: unknown) => void;
}) {
  const { environmentId, device, onRequestFailed, onRequestStarted, onRequestSucceeded } = props;
  const gt = useGT();
  const [clientId] = useState(makeClientId);
  const host: ComputerUseHost = { clientId, environmentId, device };
  const requestsAtom = computerUseEnvironment.requests({ environmentId, input: host });
  const respond = useAtomCommand(computerUseEnvironment.respond, "computer use response");
  const executionId = (requestId: string) => `${environmentId}:${clientId}:${requestId}`;
  const handleRequest = useStableCallback((request: ComputerUseRequest) => {
    const id = executionId(request.requestId);
    return desktopExecutor.execute(id, async (signal) => {
      const bridge = window.desktopBridge?.computerUse;
      if (!bridge) throw new Error(gt("The native Computer Use bridge is unavailable."));
      const onAbort = () => {
        void bridge.cancel(id);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      onRequestStarted(request);
      try {
        const result = await bridge.execute(id, request.operation, request.input);
        if (!signal.aborted) onRequestSucceeded(request, result);
        return result;
      } catch (cause) {
        if (!signal.aborted) onRequestFailed(request, cause);
        throw cause;
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    });
  });
  const cancelRequest = useStableCallback((requestId: string) => {
    desktopExecutor.cancel(executionId(requestId));
  });
  // The consumer reads the handler when a request arrives; the stable callbacks call this render's.
  const [requestHandlerAtom] = useState(() =>
    Atom.make({ handle: handleRequest, cancel: cancelRequest }),
  );
  const consumerAtom = createComputerUseRequestConsumerAtom({
    requestsAtom,
    clientId,
    requestHandlerAtom,
    respond: (response) => respond({ environmentId, input: response }),
    label: `computer-use:host:${environmentId}:${clientId}`,
  });
  useAtomValue(consumerAtom);
  return null;
}
