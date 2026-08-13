import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

export const MAX_CHAT_PANES = 16;

export interface ChatWorkspaceLayout {
  readonly paneThreadKeys: readonly string[];
  readonly activePaneIndex: number;
  readonly columns: number;
}

export function normalizeChatWorkspaceLayout(
  value: Partial<ChatWorkspaceLayout>,
  fallback: ScopedThreadRef,
): ChatWorkspaceLayout {
  const fallbackKey = scopedThreadKey(fallback);
  const paneThreadKeys = (value.paneThreadKeys ?? [])
    .filter((key): key is string => typeof key === "string" && key.includes(":"))
    .slice(0, MAX_CHAT_PANES);
  const panes = paneThreadKeys.length > 0 ? paneThreadKeys : [fallbackKey];
  const activePaneIndex = Math.min(
    Math.max(0, Math.floor(value.activePaneIndex ?? 0)),
    panes.length - 1,
  );
  const columns = Math.min(
    Math.max(1, Math.floor(value.columns ?? Math.ceil(Math.sqrt(panes.length)))),
    panes.length,
  );
  return { paneThreadKeys: panes, activePaneIndex, columns };
}

export function resizeChatWorkspaceLayout(
  layout: ChatWorkspaceLayout,
  count: number,
  columns: number,
): ChatWorkspaceLayout {
  const nextCount = Math.min(MAX_CHAT_PANES, Math.max(1, Math.floor(count)));
  const activeKey = layout.paneThreadKeys[layout.activePaneIndex] ?? layout.paneThreadKeys[0];
  if (!activeKey) return layout;
  const paneThreadKeys = layout.paneThreadKeys.slice(0, nextCount);
  while (paneThreadKeys.length < nextCount) paneThreadKeys.push(activeKey);
  const grew = nextCount > layout.paneThreadKeys.length;
  const activePaneIndex = Math.min(layout.activePaneIndex, nextCount - 1);
  if (!grew && layout.activePaneIndex >= nextCount) paneThreadKeys[activePaneIndex] = activeKey;
  return {
    paneThreadKeys,
    activePaneIndex,
    columns: Math.min(Math.max(1, Math.floor(columns)), nextCount),
  };
}

export function isChatWorkspacePlaceholder(layout: ChatWorkspaceLayout, index: number): boolean {
  const paneThreadKey = layout.paneThreadKeys[index];
  if (paneThreadKey === undefined) return true;
  const firstMatchingPane = layout.paneThreadKeys.indexOf(paneThreadKey);
  const keeperPane =
    layout.paneThreadKeys[layout.activePaneIndex] === paneThreadKey
      ? layout.activePaneIndex
      : firstMatchingPane;
  return keeperPane !== index;
}

interface ChatWorkspaceLayoutStore extends ChatWorkspaceLayout {
  syncRoute: (threadRef: ScopedThreadRef) => void;
  activatePane: (index: number) => void;
  setLayout: (count: number, columns: number) => void;
  reset: (threadRef: ScopedThreadRef) => void;
}

export const useChatWorkspaceLayoutStore = create<ChatWorkspaceLayoutStore>()(
  persist(
    (set) => ({
      paneThreadKeys: [],
      activePaneIndex: 0,
      columns: 1,
      syncRoute: (threadRef) =>
        set((state) => {
          const normalized = normalizeChatWorkspaceLayout(state, threadRef);
          const nextKey = scopedThreadKey(threadRef);
          if (normalized.paneThreadKeys[normalized.activePaneIndex] === nextKey) return normalized;
          const paneThreadKeys = [...normalized.paneThreadKeys];
          paneThreadKeys[normalized.activePaneIndex] = nextKey;
          return { ...normalized, paneThreadKeys };
        }),
      activatePane: (index) =>
        set((state) => ({
          activePaneIndex: Math.min(
            Math.max(0, Math.floor(index)),
            state.paneThreadKeys.length - 1,
          ),
        })),
      setLayout: (count, columns) =>
        set((state) => resizeChatWorkspaceLayout(state, count, columns)),
      reset: (threadRef) =>
        set({ paneThreadKeys: [scopedThreadKey(threadRef)], activePaneIndex: 0, columns: 1 }),
    }),
    {
      name: "t3code:chat-workspace-layout:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ paneThreadKeys, activePaneIndex, columns }) => ({
        paneThreadKeys,
        activePaneIndex,
        columns,
      }),
    },
  ),
);
