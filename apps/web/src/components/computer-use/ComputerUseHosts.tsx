"use client";

import { useAtomValue } from "@effect/atom-react";
import type {
  ComputerUseDevice,
  ComputerUseHost,
  ComputerUseRequest,
  EnvironmentId,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useMemo, useRef, useState } from "react";

import { isElectron } from "~/env";
import { useEnvironments } from "~/state/environments";
import { computerUseEnvironment } from "~/state/computerUse";
import { useAtomCommand } from "~/state/use-atom-command";

const makeClientId = () => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `computer-use-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
};

export function ComputerUseHosts() {
  const { environments } = useEnvironments();
  const [device, setDevice] = useState<ComputerUseDevice | null>(null);
  useEffect(() => {
    let active = true;
    void window.desktopBridge?.computerUse?.describe().then((value) => {
      if (active) setDevice(value);
    });
    return () => {
      active = false;
    };
  }, []);
  if (!isElectron || !window.desktopBridge?.computerUse || !device) return null;
  return (
    <>
      {environments.map(({ environmentId }) => (
        <ComputerUseHostConnection
          key={environmentId}
          environmentId={environmentId}
          device={device}
        />
      ))}
    </>
  );
}

function ComputerUseHostConnection(props: {
  readonly environmentId: EnvironmentId;
  readonly device: ComputerUseDevice;
}) {
  const { environmentId, device } = props;
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
    void execute(request).then(
      (result) =>
        respond({
          environmentId,
          input: {
            clientId,
            connectionId: event.connectionId,
            requestId: request.requestId,
            ok: true,
            ...(result === undefined ? {} : { result }),
          },
        }),
      (cause) =>
        respond({
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
        }),
    );
  }, [clientId, environmentId, requestResult, respond]);
  return null;
}
