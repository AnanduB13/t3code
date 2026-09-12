import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { EnvironmentId, ThreadId, type DeviceServiceState } from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useDeviceWorkspaceStore } from "~/deviceWorkspaceStore";
import { useRightPanelStore } from "~/rightPanelStore";
import { usePreviewMiniPlayerStore } from "~/previewMiniPlayerStore";
import { ThreadDeviceWorkspace } from "./ThreadDeviceWorkspace";

vi.mock("~/state/device", () => ({ useDeviceState: () => ({ state, loaded: true }) }));
vi.mock("./DeviceStreamView", () => ({ DeviceStreamView: () => null }));
const ref = { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("thread") };
const key = scopedThreadKey(ref);
const device = {
  hostId: "local",
  id: "pixel",
  name: "Pixel",
  platform: "android" as const,
  version: "16",
  booted: true,
  physical: false,
};
const state: DeviceServiceState = {
  hosts: [],
  hostStatus: "ready",
  hostStatuses: {},
  devices: [device],
  sessions: [
    {
      threadId: ref.threadId,
      hostId: device.hostId,
      deviceId: device.id,
      platform: device.platform,
      openedAt: "2026-09-12T00:00:00Z",
    },
  ],
  onboardingCompleted: true,
  agentAccessEnabled: true,
  hubBasePath: "/api/device-hub",
  revision: 1,
};
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});

it("keeps dismissed sessions closed on remount and floats devices independently of the browser", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useRightPanelStore.setState({ byThreadKey: {} });
  useDeviceWorkspaceStore.setState({ seen: {}, floating: {} });
  usePreviewMiniPlayerStore.setState({ byThreadKey: {} });
  await act(async () => {
    renderer = create(<ThreadDeviceWorkspace threadRef={ref} />);
  });
  const surface = useRightPanelStore.getState().byThreadKey[key]!.surfaces[0]!;
  expect(surface.kind).toBe("device");
  await act(async () => {
    useRightPanelStore.getState().closeSurface(ref, surface.id);
    renderer?.unmount();
  });
  await act(async () => {
    renderer = create(<ThreadDeviceWorkspace threadRef={ref} />);
  });
  expect(useRightPanelStore.getState().byThreadKey[key]?.isOpen ?? false).toBe(false);
  usePreviewMiniPlayerStore.getState().open(ref, "browser-a");
  await act(async () => {
    useDeviceWorkspaceStore.getState().float(ref, {
      hostId: device.hostId,
      deviceId: device.id,
      platform: device.platform,
      name: device.name,
    });
  });
  expect(useDeviceWorkspaceStore.getState().floating[key]?.deviceId).toBe("pixel");
  expect(usePreviewMiniPlayerStore.getState().byThreadKey[key]?.tabId).toBe("browser-a");
  await act(async () => {
    useDeviceWorkspaceStore.getState().dock(ref);
  });
  expect(usePreviewMiniPlayerStore.getState().byThreadKey[key]?.tabId).toBe("browser-a");
});
