import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { DeviceSession, ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { resolveStorage } from "./lib/storage";
import type { DeviceTabTarget } from "./rightPanelStore";

export const deviceSessionKey = (session: DeviceSession) =>
  JSON.stringify([session.hostId, session.deviceId, session.openedAt]);

interface DeviceWorkspaceState {
  seen: Record<string, string[]>;
  floating: Record<string, DeviceTabTarget | undefined>;
  observe: (ref: ScopedThreadRef, sessions: readonly DeviceSession[]) => void;
  float: (ref: ScopedThreadRef, target: DeviceTabTarget) => void;
  dock: (ref: ScopedThreadRef) => void;
}

/** Device visibility is separate from the browser's floating and view-only preferences. */
export const useDeviceWorkspaceStore = create<DeviceWorkspaceState>()(
  persist(
    (set) => ({
      seen: {},
      floating: {},
      observe: (ref, sessions) =>
        set((state) => ({
          seen: { ...state.seen, [scopedThreadKey(ref)]: sessions.map(deviceSessionKey) },
        })),
      float: (ref, target) =>
        set((state) => ({ floating: { ...state.floating, [scopedThreadKey(ref)]: target } })),
      dock: (ref) =>
        set((state) => {
          const { [scopedThreadKey(ref)]: _removed, ...floating } = state.floating;
          return { floating };
        }),
    }),
    {
      name: "t3code:device-workspace:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ seen: state.seen }),
    },
  ),
);
