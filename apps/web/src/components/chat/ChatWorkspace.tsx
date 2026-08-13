import { parseScopedThreadKey, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import {
  isChatWorkspacePlaceholder,
  normalizeChatWorkspaceLayout,
  useChatWorkspaceLayoutStore,
} from "../../chatWorkspaceLayout";
import { buildThreadRouteParams } from "../../threadRoutes";
import { resolveThreadSyncPhase } from "../../threadSync";
import { useThreadDetail, useThreadShell, useThreadStatus } from "../../state/entities";
import { useIsMobile } from "../../hooks/useMediaQuery";
import ChatView from "../ChatView";
import { DiffWorkerPoolProvider } from "../DiffWorkerPoolProvider";
import { SidebarInset } from "../ui/sidebar";

function ChatWorkspacePane(props: {
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
}

export function ChatWorkspace({ routeThreadRef }: { readonly routeThreadRef: ScopedThreadRef }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const paneThreadKeys = useChatWorkspaceLayoutStore((state) => state.paneThreadKeys);
  const activePaneIndex = useChatWorkspaceLayoutStore((state) => state.activePaneIndex);
  const columns = useChatWorkspaceLayoutStore((state) => state.columns);
  const syncRoute = useChatWorkspaceLayoutStore((state) => state.syncRoute);
  const activatePane = useChatWorkspaceLayoutStore((state) => state.activatePane);
  const setLayout = useChatWorkspaceLayoutStore((state) => state.setLayout);
  const normalizedLayout = normalizeChatWorkspaceLayout(
    { paneThreadKeys, activePaneIndex, columns },
    routeThreadRef,
  );
  const routeThreadKey = scopedThreadKey(routeThreadRef);
  const layout =
    normalizedLayout.paneThreadKeys[normalizedLayout.activePaneIndex] === routeThreadKey
      ? normalizedLayout
      : {
          ...normalizedLayout,
          paneThreadKeys: normalizedLayout.paneThreadKeys.map((key, index) =>
            index === normalizedLayout.activePaneIndex ? routeThreadKey : key,
          ),
        };

  useEffect(() => syncRoute(routeThreadRef), [routeThreadRef, syncRoute]);

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
          className="grid min-h-0 min-w-0 flex-1 bg-border"
          style={{
            gridTemplateColumns: `repeat(${visibleColumns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
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
        </div>
      </SidebarInset>
    </DiffWorkerPoolProvider>
  );
}
