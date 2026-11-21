import { EnvironmentId, type DevicePlatform } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

import { act, render, stubGlobal } from "../../../test/render";
import { DeviceStreamView } from "./DeviceStreamView";

const phoneViewer = vi.hoisted(() => ({ created: vi.fn() }));
vi.mock(import("~/state/device"), async (original) => ({
  ...(await original()),
  useDeviceHubAccess: () => access,
  refreshDeviceHubAccess: vi.fn(),
}));
vi.mock("@t3tools/client-runtime/device/phone-viewer", () => ({
  createPhoneViewer: () => {
    phoneViewer.created();
    return {
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
    };
  },
}));
vi.mock("@t3tools/client-runtime/device/frame", () => ({
  createCanvasFrameSink: () => ({ present: () => true }),
}));

const access = { httpBase: "http://test", wsBase: "ws://test", query: {}, credentials: true };

// router: false because the device view renders no links and never navigates.
const options = { router: false } as const;

async function renderDevice(phone: boolean, platform: DevicePlatform = "android") {
  phoneViewer.created.mockClear();
  const stack = new AsyncDisposableStack();
  try {
    const sockets: FakeSocket[] = [];
    let decoderOutput: VideoFrameOutputCallback | undefined;
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
    stack.use(stubGlobal("WebSocket", FakeSocket));
    stack.use(stubGlobal("fetch", async () => new Response("seed")));
    stack.use(stubGlobal("EncodedVideoChunk", vi.fn()));
    stack.use(
      stubGlobal(
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
      ),
    );
    stack.use(
      vi
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockReturnValue(new DOMRect(0, 0, 400, 800)),
    );
    // Synthetic pointer IDs have no active browser pointer to capture.
    stack.use(vi.spyOn(HTMLElement.prototype, "setPointerCapture").mockImplementation(() => {}));
    const screen = stack.use(
      await render(
        <DeviceStreamView
          environmentId={EnvironmentId.make("test")}
          hostId="local"
          platform={platform}
          deviceId="test"
          visible
          allowPhoneView={phone}
        />,
        options,
      ),
    );
    const socket = sockets.at(-1)!;
    await act(() => socket.onopen?.());
    if (platform === "ios") {
      // The simulator helper admits input before forwarding any HID event.
      await act(() => socket.onmessage?.({ data: Uint8Array.of(0x83).buffer }));
    }
    if (platform === "android") {
      await act(() => {
        // A real transport decoder reaches streaming after its first decoded frame.
        socket.onmessage?.({ data: new Uint8Array([0, 0, 1, 0x67, 0x64, 0, 0x1f]).buffer });
      });
      await act(() =>
        decoderOutput!({ displayWidth: 400, displayHeight: 800, close() {} } as VideoFrame),
      );
    }
    socket.send.mockClear();
    const { container } = screen;
    const owned = stack.move();
    return {
      container,
      socket,
      androidMessages: () => socket.send.mock.calls.map(([message]) => JSON.parse(message)),
      async tapScreen() {
        const canvas = phone
          ? container.querySelector<HTMLCanvasElement>(
              'canvas[aria-label^="Interactive 3D device"]',
            )!
          : container.querySelector("canvas")!;
        expect(canvas).not.toBeNull();
        // The 3D viewer loads asynchronously and only then accepts screen input.
        if (phone) await vi.waitFor(() => expect(phoneViewer.created).toHaveBeenCalled());
        await act(() => {
          for (const type of ["pointerdown", "pointerup"]) {
            canvas.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX: 100,
                clientY: 200,
                pointerId: 1,
              }),
            );
          }
        });
        socket.send.mockClear();
      },
      [Symbol.asyncDispose]: () => owned.disposeAsync(),
    };
  } catch (error) {
    await stack.disposeAsync();
    throw error;
  }
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

it.each([false, true])(
  "keeps typing in the emulator after tapping the screen (3D: %s)",
  async (phone) => {
    await using device = await renderDevice(phone);
    const { container, androidMessages } = device;
    await device.tapScreen();
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
  await using device = await renderDevice(true);
  const { container, androidMessages } = device;
  await device.tapScreen();
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
  await using device = await renderDevice(false, "ios");
  const { container, socket } = device;
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
