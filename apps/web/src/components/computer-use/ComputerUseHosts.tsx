"use client";

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import type {
  ComputerUseDevice,
  ComputerUseHost,
  ComputerUseRequest,
  EnvironmentId,
} from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isElectron } from "~/env";
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

let desktopExecutionTail: Promise<void> = Promise.resolve();
let desktopExecutionGeneration = 0;
const serializeDesktopExecution = <A,>(task: () => Promise<A>): Promise<A> => {
  const result = desktopExecutionTail.then(task, task);
  desktopExecutionTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

export function ComputerUseHosts() {
  const { environments } = useEnvironments();
  const [hostEnabled, setHostEnabled] = useComputerUseHostEnabled();
  const [allowedEnvironmentIds, setAllowedEnvironmentIds] = useComputerUseAllowedEnvironmentIds();
  const allowedEnvironmentIdSet = useMemo(
    () => new Set(allowedEnvironmentIds ?? []),
    [allowedEnvironmentIds],
  );
  const hostedEnvironments = useMemo(
    () => environments.filter(({ environmentId }) => allowedEnvironmentIdSet.has(environmentId)),
    [allowedEnvironmentIdSet, environments],
  );
  const [device, setDevice] = useState<ComputerUseDevice | null>(null);
  const [monitor, setMonitor] = useState<ComputerUseMonitorState | null>(null);
  const pointerSequence = useRef(0);
  useEffect(() => {
    if (!hostEnabled || allowedEnvironmentIds !== null) return;
    setAllowedEnvironmentIds(environments.map(({ environmentId }) => environmentId));
  }, [allowedEnvironmentIds, environments, hostEnabled, setAllowedEnvironmentIds]);
  useEffect(() => {
    if (!hostEnabled || hostedEnvironments.length === 0) {
      setDevice(null);
      return;
    }
    let active = true;
    setDevice(null);
    void window.desktopBridge?.computerUse?.describe().then((value) => {
      if (active) setDevice(value);
    });
    return () => {
      active = false;
    };
  }, [hostEnabled, hostedEnvironments.length]);
  useEffect(() => {
    if (!hostEnabled) {
      desktopExecutionGeneration += 1;
      void window.desktopBridge?.computerUse?.cancelAll();
      setMonitor(null);
    }
  }, [hostEnabled]);
  const onRequestStarted = useCallback(
    (request: ComputerUseRequest) => {
      pointerSequence.current += 1;
      setMonitor((current) => {
        const pointer = pointerForAction(
          current?.observation,
          request.operation,
          request.input,
          pointerSequence.current,
        );
        return {
          deviceLabel: device?.label ?? "Desktop host",
          sessionIsolation: device?.sessionIsolation ?? "shared",
          phase: request.operation === "getAppState" ? "capturing" : "acting",
          operation: request.operation,
          ...(current?.observation ? { observation: current.observation, app: current.app } : {}),
          ...(pointer ? { pointer } : current?.pointer ? { pointer: current.pointer } : {}),
        };
      });
    },
    [device?.label, device?.sessionIsolation],
  );
  const onRequestSucceeded = useCallback(
    (request: ComputerUseRequest, result: unknown) => {
      setMonitor((current) => {
        if (request.operation === "getAppState" && isComputerUseAppState(result)) {
          return {
            deviceLabel: device?.label ?? "Desktop host",
            sessionIsolation: device?.sessionIsolation ?? "shared",
            phase: "idle",
            operation: request.operation,
            app: result.app,
            observation: result,
            message: "Latest application screenshot",
          };
        }
        return current
          ? { ...current, phase: "idle", message: `${request.operation} completed` }
          : current;
      });
    },
    [device?.label, device?.sessionIsolation],
  );
  const onRequestFailed = useCallback(
    (request: ComputerUseRequest, cause: unknown) => {
      setMonitor((current) => ({
        deviceLabel: device?.label ?? "Desktop host",
        sessionIsolation: device?.sessionIsolation ?? "shared",
        phase: "error",
        operation: request.operation,
        ...(current?.observation ? { observation: current.observation, app: current.app } : {}),
        ...(current?.pointer ? { pointer: current.pointer } : {}),
        message: cause instanceof Error ? cause.message : String(cause),
      }));
    },
    [device?.label, device?.sessionIsolation],
  );
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
  const [clientId] = useState(makeClientId);
  const host = useMemo<ComputerUseHost>(
    () => ({ clientId, environmentId, device }),
    [clientId, device, environmentId],
  );
  const requestsAtom = computerUseEnvironment.requests({ environmentId, input: host });
  const respond = useAtomCommand(computerUseEnvironment.respond, "computer use response");
  const executionId = useCallback(
    (requestId: string) => `${environmentId}:${clientId}:${requestId}`,
    [clientId, environmentId],
  );
  const handleRequest = useCallback(
    (request: ComputerUseRequest) => {
      const requestedGeneration = desktopExecutionGeneration;
      return serializeDesktopExecution(async () => {
        if (requestedGeneration !== desktopExecutionGeneration) {
          throw new Error("Computer Use was disabled before this action started.");
        }
        const bridge = window.desktopBridge?.computerUse;
        if (!bridge) throw new Error("The native Computer Use bridge is unavailable.");
        onRequestStarted(request);
        try {
          const result = await bridge.execute(
            executionId(request.requestId),
            request.operation,
            request.input,
          );
          onRequestSucceeded(request, result);
          return result;
        } catch (cause) {
          onRequestFailed(request, cause);
          throw cause;
        }
      });
    },
    [executionId, onRequestFailed, onRequestStarted, onRequestSucceeded],
  );
  const cancelRequest = useCallback(
    (requestId: string) => {
      void window.desktopBridge?.computerUse?.cancel(executionId(requestId));
    },
    [executionId],
  );
  const [requestHandlerAtom] = useState(() =>
    Atom.make({ handle: handleRequest, cancel: cancelRequest }),
  );
  const setRequestHandler = useAtomSet(requestHandlerAtom);
  useEffect(() => {
    setRequestHandler({ handle: handleRequest, cancel: cancelRequest });
  }, [cancelRequest, handleRequest, setRequestHandler]);
  const consumerAtom = useMemo(
    () =>
      createComputerUseRequestConsumerAtom({
        requestsAtom,
        clientId,
        requestHandlerAtom,
        respond: (response) => respond({ environmentId, input: response }),
        label: `computer-use:host:${environmentId}:${clientId}`,
      }),
    [clientId, environmentId, requestHandlerAtom, requestsAtom, respond],
  );
  useAtomValue(consumerAtom);
  return null;
}
