"use client";

import { Camera, ChevronDown, MonitorUp, MousePointer2, X } from "lucide-react";
import { T, useGT, Var } from "gt-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

import type { ComputerUseMonitorState } from "./computerUseMonitorState";

export function ComputerUseMonitor({
  state,
  onStop,
}: {
  readonly state: ComputerUseMonitorState | null;
  readonly onStop: () => void;
}) {
  const gt = useGT();
  const [collapsed, setCollapsed] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (!state) return null;
  if (hidden) {
    return (
      <Button
        type="button"
        variant="glass"
        size="icon-sm-pill"
        className="fixed right-4 top-14 z-[80]"
        aria-label={gt("Show Computer Use monitor")}
        onClick={() => setHidden(false)}
      >
        <MonitorUp className="size-4" />
      </Button>
    );
  }

  const screenshot = state.observation?.screenshot;
  return (
    <aside
      aria-label={gt("Computer Use monitor")}
      className="fixed right-4 top-14 z-[80] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border/80 bg-background/95 shadow-2xl backdrop-blur"
    >
      <header className="flex h-10 items-center gap-2 border-b px-3">
        <span
          className={cn(
            "size-2 rounded-full",
            state.phase === "error"
              ? "bg-destructive"
              : state.phase === "idle"
                ? "bg-success"
                : "bg-warning",
          )}
        />
        <Camera className="size-3.5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">
            <T>
              Computer Use · <Var>{state.deviceLabel}</Var>
            </T>
          </p>
          <p className="truncate text-3xs text-muted-foreground">
            {state.phase === "capturing"
              ? gt("Capturing application window")
              : state.phase === "acting"
                ? gt("{operation} in {app}", {
                    operation: state.operation,
                    app: state.app ?? gt("selected window"),
                  })
                : (state.message ?? state.app ?? gt("Latest agent view"))}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={
            collapsed ? gt("Expand Computer Use monitor") : gt("Collapse Computer Use monitor")
          }
          onClick={() => setCollapsed((value) => !value)}
        >
          <ChevronDown className={cn("size-3.5 transition-transform", collapsed && "-rotate-90")} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-label={gt("Stop sharing this computer with agents")}
          onClick={onStop}
        >
          <T>Stop</T>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={gt("Hide Computer Use monitor")}
          onClick={() => setHidden(true)}
        >
          <X className="size-3.5" />
        </Button>
      </header>
      {!collapsed && (
        <div className="p-2">
          <div className="relative grid aspect-video place-items-center overflow-hidden rounded-lg bg-black/90">
            {screenshot ? (
              <img
                src={`data:${screenshot.mimeType};base64,${screenshot.data}`}
                alt={gt("Latest Computer Use screenshot of {app}", {
                  app: state.observation?.app ?? gt("application"),
                })}
                className="size-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-xs text-white/60">
                <Camera className="size-5" />
                <T>Waiting for the first application screenshot</T>
              </div>
            )}
            {state.pointer && (
              <div
                key={state.pointer.sequence}
                data-testid="computer-use-virtual-pointer"
                className="pointer-events-none absolute z-10 -translate-x-[2px] -translate-y-[2px] transition-[left,top] duration-300 ease-out"
                style={{ left: `${state.pointer.xPercent}%`, top: `${state.pointer.yPercent}%` }}
              >
                <span className="absolute -left-2 -top-2 size-5 rounded-full bg-info/35" />
                <MousePointer2 className="relative size-5 fill-info text-white drop-shadow-md" />
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 px-1 text-3xs text-muted-foreground">
            <span className="truncate">
              {state.observation?.app ?? gt("No window captured yet")}
            </span>
            <span className="shrink-0">
              {state.sessionIsolation === "isolated"
                ? gt("Isolated session")
                : gt("Shared session")}
              {screenshot ? ` · ${screenshot.width}×${screenshot.height}` : ""}
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
