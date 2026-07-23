"use client";

import { useAtomValue } from "@effect/atom-react";
import type {
  ComputerUseDevice,
  ComputerUseHost,
  ComputerUseRequest,
  EnvironmentId,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isElectron } from "~/env";
import { useEnvironments } from "~/state/environments";
import { computerUseEnvironment } from "~/state/computerUse";
import { useAtomCommand } from "~/state/use-atom-command";

import { ComputerUseMonitor } from "./ComputerUseMonitor";
import {
  isComputerUseAppState,
  pointerForAction,
  type ComputerUseMonitorState,
} from "./computerUseMonitorState";

const makeClientId = () => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `computer-use-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
};

export function ComputerUseHosts() {
  const { environments } = useEnvironments();
  const [device, setDevice] = useState<ComputerUseDevice | null>(null);
  const [monitor, setMonitor] = useState<ComputerUseMonitorState | null>(null);
  const pointerSequence = useRef(0);
  useEffect(() => {
    let active = true;
    void window.desktopBridge?.computerUse?.describe().then((value) => {
      if (active) setDevice(value);
    });
    return () => {
      active = false;
    };
  }, []);
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
  if (!isElectron || !window.desktopBridge?.computerUse || !device) return null;
  return (
    <>
      {environments.map(({ environmentId }) => (
        <ComputerUseHostConnection
          key={environmentId}
          environmentId={environmentId}
          device={device}
          onRequestStarted={onRequestStarted}
          onRequestSucceeded={onRequestSucceeded}
          onRequestFailed={onRequestFailed}
        />
      ))}
      <ComputerUseMonitor state={monitor} />
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
  const requestResult = useAtomValue(
    computerUseEnvironment.requests({ environmentId, input: host }),
  );
  const respond = useAtomCommand(computerUseEnvironment.respond, "computer use response");
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!AsyncResult.isSuccess(requestResult) || requestResult.value.type !== "request") return;
    const event = requestResult.value;
    const request = event.request;
    if (handled.current.has(request.requestId)) return;
    handled.current.add(request.requestId);
    const bridge = window.desktopBridge?.computerUse;
    const execute = async (input: ComputerUseRequest) => {
      if (!bridge) throw new Error("The native Computer Use bridge is unavailable.");
      return await bridge.execute(input.operation, input.input);
    };
    onRequestStarted(request);
    void execute(request).then(
      (result) => {
        onRequestSucceeded(request, result);
        return respond({
          environmentId,
          input: {
            clientId,
            connectionId: event.connectionId,
            requestId: request.requestId,
            ok: true,
            ...(result === undefined ? {} : { result }),
          },
        });
      },
      (cause) => {
        onRequestFailed(request, cause);
        return respond({
          environmentId,
          input: {
            clientId,
            connectionId: event.connectionId,
            requestId: request.requestId,
            ok: false,
            error: {
              _tag: "ComputerUseNativeExecutionError",
              message: cause instanceof Error ? cause.message : String(cause),
            },
          },
        });
      },
    );
  }, [
    clientId,
    environmentId,
    onRequestFailed,
    onRequestStarted,
    onRequestSucceeded,
    requestResult,
    respond,
  ]);
  return null;
}
