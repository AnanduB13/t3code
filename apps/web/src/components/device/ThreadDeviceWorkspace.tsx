import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";
import { PanelRight, X } from "lucide-react";
import { deviceSessionKey, useDeviceWorkspaceStore } from "~/deviceWorkspaceStore";
import { useRightPanelStore } from "~/rightPanelStore";
import { useDeviceState } from "~/state/device";
import { Button } from "../ui/button";
import { DeviceStreamView } from "./DeviceStreamView";

/** New agent sessions open once; dismissing a tab does not stop the device or reopen it. */
export function ThreadDeviceWorkspace({ threadRef }: { threadRef: ScopedThreadRef }) {
  const { state, loaded } = useDeviceState(threadRef.environmentId);
  const key = scopedThreadKey(threadRef);
  const target = useDeviceWorkspaceStore((s) => s.floating[key]);
  const panel = useRightPanelStore((s) => s.byThreadKey[key]);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null>(null);
  useEffect(() => {
    if (!loaded) return;
    const sessions = state.sessions.filter((s) => s.threadId === threadRef.threadId);
    const workspace = useDeviceWorkspaceStore.getState();
    const seen = workspace.seen[key] ?? [];
    for (const session of sessions) {
      if (seen.includes(deviceSessionKey(session))) continue;
      const device = state.devices.find(
        (d) => d.hostId === session.hostId && d.id === session.deviceId,
      );
      if (device)
        useRightPanelStore.getState().openDevice(threadRef, {
          hostId: device.hostId,
          deviceId: device.id,
          platform: device.platform,
          name: device.name,
        });
    }
    workspace.observe(threadRef, sessions);
    if (
      target &&
      !sessions.some((s) => s.hostId === target.hostId && s.deviceId === target.deviceId)
    )
      workspace.dock(threadRef);
  }, [key, loaded, state.sessions, state.devices, threadRef, target]);
  useEffect(() => {
    const active = panel?.surfaces.find((s) => s.id === panel.activeSurfaceId);
    if (
      target &&
      panel?.isOpen &&
      active?.kind === "device" &&
      active.target?.hostId === target.hostId &&
      active.target.deviceId === target.deviceId
    )
      useDeviceWorkspaceStore.getState().dock(threadRef);
  }, [panel, target, threadRef]);
  if (!target) return null;
  return (
    <section
      aria-label={`Floating device: ${target.name}`}
      className="absolute bottom-4 right-4 z-30 flex h-96 w-64 min-h-64 min-w-48 max-h-[85%] max-w-[90%] resize flex-col overflow-hidden rounded-lg border bg-background shadow-xl"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      <div
        className="flex h-9 shrink-0 touch-none items-center gap-1 border-b px-2"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          const header = event.currentTarget;
          const bounds = header.parentElement?.getBoundingClientRect();
          const container = header.parentElement?.parentElement?.getBoundingClientRect();
          if (!bounds || !container) return;
          drag.current = {
            ...position,
            clientX: event.clientX,
            clientY: event.clientY,
            minX: position.x + container.left - bounds.left,
            maxX: position.x + container.right - bounds.right,
            minY: position.y + container.top - bounds.top,
            maxY: position.y + container.bottom - bounds.bottom,
          };
          header.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start) return;
          setPosition({
            x: Math.max(start.minX, Math.min(start.maxX, start.x + event.clientX - start.clientX)),
            y: Math.max(start.minY, Math.min(start.maxY, start.y + event.clientY - start.clientY)),
          });
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <span className="min-w-0 flex-1 truncate text-xs">{target.name}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dock device"
          onClick={() => {
            useRightPanelStore.getState().openDevice(threadRef, target);
            useDeviceWorkspaceStore.getState().dock(threadRef);
          }}
        >
          <PanelRight />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close floating device"
          onClick={() => useDeviceWorkspaceStore.getState().dock(threadRef)}
        >
          <X />
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        <DeviceStreamView
          environmentId={threadRef.environmentId}
          hostId={target.hostId}
          deviceId={target.deviceId}
          platform={target.platform}
          deviceName={target.name}
          visible
        />
      </div>
    </section>
  );
}
