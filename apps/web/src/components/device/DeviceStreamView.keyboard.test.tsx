// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EnvironmentId, type DevicePlatform } from "@t3tools/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { DeviceStreamView } from "./DeviceStreamView";

vi.mock("~/state/device", () => ({
  useDeviceHubAccess: () => access,
  refreshDeviceHubAccess: vi.fn(),
}));
vi.mock("@t3tools/client-runtime/device/phone-viewer", () => ({
  createPhoneViewer: () => ({
    setFoldAngle() {},
    setModel() {},
    setAccessory() {},
    setScreen() {},
    resetPose() {},
    frameUpdated() {},
    setInteractionActive() {},
    screenPoint: (x: number, y: number) => ({ x, y }),
    orbit() {},
    resize() {},
    dispose() {},
  }),
}));
vi.mock("@t3tools/client-runtime/device/frame", () => ({
  createCanvasFrameSink: () => ({ present: () => true }),
}));

const access = { httpBase: "http://test", wsBase: "ws://test", query: {}, credentials: true };
let root: Root | undefined;
let container: HTMLDivElement;
let socket: FakeSocket;
const sockets: FakeSocket[] = [];
let decoderOutput: VideoFrameOutputCallback;

class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  binaryType = "";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
  send = vi.fn();
  close() {}
  constructor() {
    sockets.push(this);
  }
}

beforeEach(() => {
  sockets.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("fetch", async () => new Response("seed"));
  vi.stubGlobal("EncodedVideoChunk", vi.fn());
  vi.stubGlobal(
    "VideoDecoder",
    class {
      static isConfigSupported = async () => ({ supported: true });
      state = "unconfigured";
      constructor(options: VideoDecoderInit) {
        decoderOutput = options.output;
      }
      configure() {
        this.state = "configured";
      }
      close() {
        this.state = "closed";
      }
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 400,
    bottom: 800,
    width: 400,
    height: 800,
    toJSON() {},
  });
  vi.stubGlobal("PointerEvent", MouseEvent);
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root?.unmount());
  root = undefined;
  container.remove();
  Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderDevice(phone: boolean, platform: DevicePlatform = "android") {
  await act(() =>
    root!.render(
      <DeviceStreamView
        environmentId={EnvironmentId.make("test")}
        hostId="local"
        platform={platform}
        deviceId="test"
        visible
        allowPhoneView={phone}
      />,
    ),
  );
  socket = sockets.at(-1)!;
  await act(() => socket.onopen?.());
  if (platform === "android") {
    await act(() => {
      // A real transport decoder reaches streaming after its first decoded frame.
      socket.onmessage?.({ data: new Uint8Array([0, 0, 1, 0x67, 0x64, 0, 0x1f]).buffer });
    });
    await act(() =>
      decoderOutput({ displayWidth: 400, displayHeight: 800, close() {} } as VideoFrame),
    );
  }
  socket.send.mockClear();
}

async function tapScreen(phone: boolean) {
  const canvas = phone
    ? container.querySelector<HTMLCanvasElement>('canvas[aria-label^="Interactive 3D device"]')!
    : container.querySelector("canvas")!;
  expect(canvas).not.toBeNull();
  await act(() => {
    for (const type of ["pointerdown", "pointerup"]) {
      canvas.dispatchEvent(
        Object.assign(
          new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 100, clientY: 200 }),
          { pointerId: 1 },
        ),
      );
    }
  });
  socket.send.mockClear();
}

async function pressKey(key: string, options: KeyboardEventInit = {}) {
  await act(() => {
    for (const type of ["keydown", "keyup"]) {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent(type, { bubbles: true, cancelable: true, key, ...options }),
      );
    }
  });
}

const androidMessages = () => socket.send.mock.calls.map(([message]) => JSON.parse(message));

it.each([false, true])(
  "keeps typing in the emulator after tapping the screen (3D: %s)",
  async (phone) => {
    await renderDevice(phone);
    await tapScreen(phone);
    expect(document.activeElement).toBe(container.querySelector("textarea"));

    await pressKey("a", { code: "KeyA" });
    await pressKey("@", { code: "Digit2", shiftKey: true });
    await pressKey("Backspace", { code: "Backspace" });
    await pressKey("a", { code: "KeyA", ctrlKey: true });
    expect(androidMessages()).toEqual([
      { type: "text", text: "a" },
      { type: "text", text: "@" },
      { type: "key", keycode: 67, metaState: 0 },
      { type: "key", keycode: 29, metaState: 4096 },
    ]);

    const composer = document.createElement("textarea");
    container.append(composer);
    composer.focus();
    await pressKey("b", { code: "KeyB" });
    expect(androidMessages()).toHaveLength(4);
  },
);

it("receives paste and committed composition after tapping the 3D screen", async () => {
  await renderDevice(true);
  await tapScreen(true);
  expect(document.activeElement).toBe(container.querySelector("textarea"));
  await pressKey("v", { code: "KeyV", ctrlKey: true });
  await act(() => {
    const paste = Object.assign(new Event("paste", { bubbles: true, cancelable: true }), {
      clipboardData: { getData: () => "broker.example.com" },
    });
    document.activeElement!.dispatchEvent(paste);
  });
  await pressKey("n", { code: "KeyN", isComposing: true });
  await act(() =>
    document.activeElement!.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "नमस्ते" }),
    ),
  );
  expect(androidMessages()).toEqual([
    { type: "text", text: "broker.example.com" },
    { type: "text", text: "नमस्ते" },
  ]);
});

it("uses an editable keyboard target for iOS and still forwards HID key presses", async () => {
  await renderDevice(false, "ios");
  await act(() => container.querySelector<HTMLElement>('[role="application"]')!.focus());
  expect(document.activeElement).toBe(container.querySelector("textarea"));
  await pressKey("a", { code: "KeyA" });
  expect(
    socket.send.mock.calls.map(([bytes]) => ({
      tag: (bytes as Uint8Array)[0],
      body: JSON.parse(new TextDecoder().decode((bytes as Uint8Array).subarray(1))),
    })),
  ).toEqual([
    { tag: 0x06, body: { type: "down", usage: 4 } },
    { tag: 0x06, body: { type: "up", usage: 4 } },
  ]);
});
