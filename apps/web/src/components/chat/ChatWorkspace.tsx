import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  useEffect,
  useLayoutEffect,
  memo,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  isChatWorkspacePlaceholder,
  normalizeChatWorkspaceLayout,
  resizeAdjacentChatWorkspaceWeights,
  useChatWorkspaceLayoutStore,
  type ChatWorkspaceAxis,
} from "../../chatWorkspaceLayout";
import { buildThreadRouteParams } from "../../threadRoutes";
import { resolveThreadSyncPhase } from "../../threadSync";
import { useThreadDetail, useThreadShell, useThreadStatus } from "../../state/entities";
import { useIsMobile } from "../../hooks/useMediaQuery";
import ChatView from "../ChatView";
import { DiffWorkerPoolProvider } from "../DiffWorkerPoolProvider";
import { SidebarInset } from "../ui/sidebar";

const MIN_COLUMN_SIZE_PX = 160;
const MIN_ROW_SIZE_PX = 140;

function dividerPosition(weights: readonly number[], dividerIndex: number): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const before = weights.slice(0, dividerIndex + 1).reduce((sum, weight) => sum + weight, 0);
  return total > 0 ? (before / total) * 100 : 0;
}

function dividerKey(axis: ChatWorkspaceAxis, dividerIndex: number): string {
  return `${axis}:${dividerIndex}`;
}

function ChatWorkspaceDivider(props: {
  readonly axis: ChatWorkspaceAxis;
  readonly dividerIndex: number;
  readonly weights: readonly number[];
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  readonly onPreview: (axis: ChatWorkspaceAxis, weights: readonly number[]) => void;
  readonly onCommit: (axis: ChatWorkspaceAxis, weights: readonly number[]) => void;
  readonly onCancel: () => void;
}) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const position = dividerPosition(props.weights, props.dividerIndex);
  const vertical = props.axis === "columns";

  useEffect(() => () => cleanupRef.current?.(), []);

  const resizeByKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const direction = vertical
      ? event.key === "ArrowLeft"
        ? -1
        : event.key === "ArrowRight"
          ? 1
          : 0
      : event.key === "ArrowUp"
        ? -1
        : event.key === "ArrowDown"
          ? 1
          : 0;
    if (direction === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const pairWeight =
      (props.weights[props.dividerIndex] ?? 0) + (props.weights[props.dividerIndex + 1] ?? 0);
    const step = pairWeight * (event.shiftKey ? 0.1 : 0.025) * direction;
    const bounds = props.containerRef.current?.getBoundingClientRect();
    const dimension = bounds ? (vertical ? bounds.width : bounds.height) : 0;
    const totalWeight = props.weights.reduce((sum, weight) => sum + weight, 0);
    const minimumPixels = vertical ? MIN_COLUMN_SIZE_PX : MIN_ROW_SIZE_PX;
    const minimumWeight = dimension > 0 ? (minimumPixels / dimension) * totalWeight : 0.05;
    props.onCommit(
      props.axis,
      resizeAdjacentChatWorkspaceWeights(props.weights, props.dividerIndex, step, minimumWeight),
    );
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const container = props.containerRef.current;
    if (!container) return;
    event.preventDefault();
    event.stopPropagation();
    cleanupRef.current?.();

    const target = event.currentTarget;
    const pointerId = event.pointerId;
    const startPosition = vertical ? event.clientX : event.clientY;
    const bounds = container.getBoundingClientRect();
    const dimension = vertical ? bounds.width : bounds.height;
    if (dimension <= 0) return;
    const startWeights = [...props.weights];
    const totalWeight = startWeights.reduce((sum, weight) => sum + weight, 0);
    const minimumPixels = vertical ? MIN_COLUMN_SIZE_PX : MIN_ROW_SIZE_PX;
    const minimumWeight = (minimumPixels / dimension) * totalWeight;
    let latestWeights = startWeights;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    let animationFrame: number | null = null;
    document.body.style.cursor = vertical ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    try {
      target.setPointerCapture(pointerId);
    } catch {
      // Window listeners below keep resizing functional without pointer capture.
    }

    function cleanup() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      cleanupRef.current = null;
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        // The browser may already have released capture on pointerup.
      }
    }
    function move(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();
      const currentPosition = vertical ? moveEvent.clientX : moveEvent.clientY;
      latestWeights = resizeAdjacentChatWorkspaceWeights(
        startWeights,
        props.dividerIndex,
        ((currentPosition - startPosition) / dimension) * totalWeight,
        minimumWeight,
      );
      if (animationFrame !== null) return;
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        props.onPreview(props.axis, latestWeights);
      });
    }
    function finish(upEvent: PointerEvent) {
      if (upEvent.pointerId !== pointerId) return;
      cleanup();
      props.onCommit(props.axis, latestWeights);
    }
    function cancel(cancelEvent: PointerEvent) {
      if (cancelEvent.pointerId !== pointerId) return;
      cleanup();
      props.onCancel();
    }
    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
  };

  return (
    <div
      role="separator"
      aria-label={`Resize chat ${vertical ? "columns" : "rows"} ${props.dividerIndex + 1} and ${props.dividerIndex + 2}`}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
      tabIndex={0}
      className={
        vertical
          ? "group absolute inset-y-0 z-20 w-2 -translate-x-1/2 touch-none cursor-col-resize select-none focus-visible:outline-none"
          : "group absolute inset-x-0 z-20 h-2 -translate-y-1/2 touch-none cursor-row-resize select-none focus-visible:outline-none"
      }
      style={vertical ? { left: `${position}%` } : { top: `${position}%` }}
      onKeyDown={resizeByKeyboard}
      onPointerDown={startResize}
    >
      <span
        aria-hidden
        className={
          vertical
            ? "pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-info group-focus-visible:bg-info group-active:bg-info"
            : "pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border transition-colors group-hover:bg-info group-focus-visible:bg-info group-active:bg-info"
        }
      />
    </div>
  );
}

const ChatWorkspacePane = memo(function ChatWorkspacePane(props: {
  readonly threadRef: ScopedThreadRef;
  readonly active: boolean;
  readonly reserveNativeControls: boolean;
  readonly paneCount: number;
  readonly columns: number;
  readonly onSetLayout: (count: number, columns: number) => void;
}) {
  const shell = useThreadShell(props.threadRef);
  const detail = useThreadDetail(props.threadRef);
  const status = useThreadStatus(props.threadRef);
  const threadSyncPhase = resolveThreadSyncPhase({
    detailExists: detail !== null,
    shellExists: shell !== null,
    status,
  });

  if (!shell && !detail) {
    return (
      <div className="grid min-h-0 place-items-center bg-background p-6 text-center text-sm text-muted-foreground">
        This chat is unavailable. Select this pane, then choose another thread from the sidebar.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <ChatView
        environmentId={props.threadRef.environmentId}
        threadId={props.threadRef.threadId}
        routeKind="server"
        threadSyncPhase={threadSyncPhase}
        reserveTitleBarControlInset={props.reserveNativeControls}
        workspacePaneActive={props.active}
        chatPaneCount={props.paneCount}
        chatLayoutColumns={props.columns}
        onSetChatLayout={props.onSetLayout}
        withDiffWorkerPool={false}
      />
    </div>
  );
});

export function ChatWorkspace({ routeThreadRef }: { readonly routeThreadRef: ScopedThreadRef }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const paneThreadKeys = useChatWorkspaceLayoutStore((state) => state.paneThreadKeys);
  const activePaneIndex = useChatWorkspaceLayoutStore((state) => state.activePaneIndex);
  const columns = useChatWorkspaceLayoutStore((state) => state.columns);
  const columnWeights = useChatWorkspaceLayoutStore((state) => state.columnWeights);
  const rowWeights = useChatWorkspaceLayoutStore((state) => state.rowWeights);
  const syncRoute = useChatWorkspaceLayoutStore((state) => state.syncRoute);
  const activatePane = useChatWorkspaceLayoutStore((state) => state.activatePane);
  const setLayout = useChatWorkspaceLayoutStore((state) => state.setLayout);
  const setAxisWeights = useChatWorkspaceLayoutStore((state) => state.setAxisWeights);
  const gridRef = useRef<HTMLDivElement>(null);
  const [previewWeights, setPreviewWeights] = useState<{
    readonly axis: ChatWorkspaceAxis;
    readonly weights: readonly number[];
  } | null>(null);
  const routeEnvironmentId = routeThreadRef.environmentId;
  const routeThreadId = routeThreadRef.threadId;
  const layout = useMemo(
    () =>
      normalizeChatWorkspaceLayout(
        { paneThreadKeys, activePaneIndex, columns, columnWeights, rowWeights },
        { environmentId: routeEnvironmentId, threadId: routeThreadId },
      ),
    [
      activePaneIndex,
      columnWeights,
      columns,
      paneThreadKeys,
      routeEnvironmentId,
      routeThreadId,
      rowWeights,
    ],
  );

  // Pane activation updates before URL navigation completes. Reconcile only when the URL itself
  // changes so the outgoing route never replaces and remounts the newly active pane.
  useLayoutEffect(
    () => syncRoute({ environmentId: routeEnvironmentId, threadId: routeThreadId }),
    [routeEnvironmentId, routeThreadId, syncRoute],
  );

  const paneEntries = useMemo(() => {
    const occurrences = new Map<string, number>();
    return layout.paneThreadKeys.flatMap((threadKey, index) => {
      const threadRef = parseScopedThreadKey(threadKey);
      if (!threadRef) return [];
      const occurrence = occurrences.get(threadKey) ?? 0;
      occurrences.set(threadKey, occurrence + 1);
      return [{ threadRef, index, instanceKey: `${threadKey}#${occurrence}` }];
    });
  }, [layout.paneThreadKeys]);
  const visibleColumns = isMobile ? 1 : layout.columns;
  const visiblePaneCount = isMobile ? 1 : paneEntries.length;
  const rows = Math.ceil(visiblePaneCount / visibleColumns);
  const visibleColumnWeights = isMobile
    ? [1]
    : previewWeights?.axis === "columns"
      ? previewWeights.weights
      : layout.columnWeights;
  const visibleRowWeights = isMobile
    ? [1]
    : previewWeights?.axis === "rows"
      ? previewWeights.weights
      : layout.rowWeights;

  useEffect(() => setPreviewWeights(null), [visibleColumns, rows]);

  const previewAxisWeights = (axis: ChatWorkspaceAxis, weights: readonly number[]) => {
    setPreviewWeights({ axis, weights });
  };
  const commitAxisWeights = (axis: ChatWorkspaceAxis, weights: readonly number[]) => {
    setAxisWeights(axis, weights);
    setPreviewWeights(null);
  };

  const activate = (index: number, threadRef: ScopedThreadRef) => {
    if (index === layout.activePaneIndex) return;
    activatePane(index);
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
    });
  };

  return (
    <DiffWorkerPoolProvider>
      <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
        <div
          ref={gridRef}
          className="relative grid min-h-0 min-w-0 flex-1 bg-border"
          style={{
            gridTemplateColumns: visibleColumnWeights
              .map((weight) => `minmax(0, ${weight}fr)`)
              .join(" "),
            gridTemplateRows: visibleRowWeights.map((weight) => `minmax(0, ${weight}fr)`).join(" "),
            gap: paneEntries.length > 1 && !isMobile ? "1px" : undefined,
          }}
        >
          {paneEntries.map(({ threadRef, index, instanceKey }) => {
            const active = index === layout.activePaneIndex;
            const placeholder = isChatWorkspacePlaceholder(layout, index);
            return (
              <section
                key={instanceKey}
                className={
                  active
                    ? `relative flex min-h-0 min-w-0 ${paneEntries.length > 1 ? "z-10 ring-1 ring-inset ring-info/60" : ""}`
                    : "hidden min-h-0 min-w-0 md:flex"
                }
                aria-label={`Chat pane ${index + 1} of ${paneEntries.length}`}
                data-chat-workspace-pane={index}
                data-active={active ? "true" : "false"}
                onPointerDownCapture={active ? undefined : () => activate(index, threadRef)}
              >
                {placeholder ? (
                  <div className="grid min-h-0 flex-1 place-items-center bg-background p-6 text-center text-sm text-muted-foreground">
                    <div className="max-w-52 space-y-1">
                      <p className="font-medium text-foreground">Empty chat pane</p>
                      <p>Click here, then choose a thread from the sidebar.</p>
                    </div>
                  </div>
                ) : (
                  <ChatWorkspacePane
                    threadRef={threadRef}
                    active={active}
                    reserveNativeControls={isMobile || index === visibleColumns - 1}
                    paneCount={paneEntries.length}
                    columns={layout.columns}
                    onSetLayout={setLayout}
                  />
                )}
              </section>
            );
          })}
          {!isMobile
            ? visibleColumnWeights
                .slice(0, -1)
                .map((_, dividerIndex) => (
                  <ChatWorkspaceDivider
                    key={dividerKey("columns", dividerIndex)}
                    axis="columns"
                    dividerIndex={dividerIndex}
                    weights={visibleColumnWeights}
                    containerRef={gridRef}
                    onPreview={previewAxisWeights}
                    onCommit={commitAxisWeights}
                    onCancel={() => setPreviewWeights(null)}
                  />
                ))
            : null}
          {!isMobile
            ? visibleRowWeights
                .slice(0, -1)
                .map((_, dividerIndex) => (
                  <ChatWorkspaceDivider
                    key={dividerKey("rows", dividerIndex)}
                    axis="rows"
                    dividerIndex={dividerIndex}
                    weights={visibleRowWeights}
                    containerRef={gridRef}
                    onPreview={previewAxisWeights}
                    onCommit={commitAxisWeights}
                    onCancel={() => setPreviewWeights(null)}
                  />
                ))
            : null}
        </div>
      </SidebarInset>
    </DiffWorkerPoolProvider>
  );
}
