import { ComputerUseActionResult, ComputerUseAppState } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const native = vi.hoisted(() => {
  const bounds = { left: 100, top: 50, width: 800, height: 600 };
  const window = {
    windowHandle: 42,
    title: "Editor",
    region: bounds,
    focus: vi.fn(async () => true),
    getElements: vi.fn(async () => ({ role: "AXWindow", children: [] })),
  };
  return {
    bounds,
    window,
    getWindows: vi.fn(async () => [window]),
    getActiveWindow: vi.fn(async () => window),
    getWindowRegion: vi.fn(async () => bounds),
    getSources: vi.fn(),
    wait: vi.fn(async (_duration: number) => undefined),
    keyboard: {
      config: { autoDelayMs: 300 },
      type: vi.fn(async (_text: string) => undefined),
      pressKey: vi.fn(async (..._keys: number[]) => undefined),
      releaseKey: vi.fn(async (..._keys: number[]) => undefined),
    },
    setKeyboardDelay: vi.fn(),
    mouse: {
      config: { mouseSpeed: 0, autoDelayMs: 100 },
      move: vi.fn(async (_path: unknown) => undefined),
      getPosition: vi.fn(async () => ({ x: 0, y: 0 })),
      setPosition: vi.fn(async (_point: { x: number; y: number }) => undefined),
      click: vi.fn(async () => undefined),
      doubleClick: vi.fn(async () => undefined),
      pressButton: vi.fn(async () => undefined),
      releaseButton: vi.fn(async () => undefined),
      scrollDown: vi.fn(async () => undefined),
      scrollUp: vi.fn(async () => undefined),
      scrollLeft: vi.fn(async () => undefined),
      scrollRight: vi.fn(async () => undefined),
    },
  };
});

vi.mock("@t3tools/shared/hostProcess", async () => {
  const Effect = await import("effect/Effect");
  return {
    HostProcessPlatform: Effect.succeed("darwin"),
    HostProcessArchitecture: Effect.succeed("arm64"),
    HostProcessHostname: Effect.succeed("Test Mac"),
    HostProcessEnvironment: Effect.succeed({}),
  };
});
vi.mock("electron-store", () => ({
  default: class {
    get() {
      return "test-device";
    }
  },
}));
vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/t3-computer-use-test" },
  systemPreferences: {
    isTrustedAccessibilityClient: () => true,
    getMediaAccessStatus: () => "granted",
  },
  desktopCapturer: { getSources: native.getSources },
  screen: { getDisplayMatching: () => ({ scaleFactor: 1 }) },
}));
vi.mock("node:timers/promises", () => ({ setTimeout: native.wait }));
vi.mock("@nut-tree-fork/nut-js", () => ({
  getWindows: native.getWindows,
  getActiveWindow: native.getActiveWindow,
  providerRegistry: {
    getWindow: () => ({ getWindowRegion: native.getWindowRegion }),
    getKeyboard: () => ({ setKeyboardDelay: native.setKeyboardDelay }),
  },
  keyboard: native.keyboard,
  mouse: native.mouse,
  Button: { LEFT: 0, RIGHT: 1, MIDDLE: 2 },
  Key: { A: 1, LeftCmd: 2, Enter: 3 },
  Point: class {
    readonly x: number;
    readonly y: number;
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
  straightTo: (point: unknown) => point,
}));

let host: typeof import("./nativeComputerUse.ts");
let request = 0;
const decodeState = Schema.decodeUnknownSync(ComputerUseAppState);
const decodeAction = Schema.decodeUnknownSync(ComputerUseActionResult);
const observe = async () =>
  decodeState(
    await host.executeComputerUse(`observe-${request++}`, "getAppState", { app: "Editor" }),
  );
const target = (state: ComputerUseAppState) => ({
  windowId: state.windowId,
  observationId: state.observationId,
});

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  Object.assign(native.bounds, { left: 100, top: 50, width: 800, height: 600 });
  native.getWindows.mockResolvedValue([native.window]);
  native.getActiveWindow.mockResolvedValue(native.window);
  native.getWindowRegion.mockImplementation(async () => native.bounds);
  native.mouse.getPosition.mockResolvedValue({ x: 0, y: 0 });
  native.window.focus.mockResolvedValue(true);
  native.window.getElements.mockResolvedValue({ role: "AXWindow", children: [] });
  native.getSources.mockResolvedValue([
    {
      id: "window:42:0",
      name: "Editor",
      thumbnail: {
        isEmpty: () => false,
        getSize: () => ({ width: 800, height: 600 }),
        toPNG: () => Buffer.from("test-png"),
      },
    },
  ]);
  host = await import("./nativeComputerUse.ts");
});

describe("native Computer Use adapter", () => {
  it("captures once and leaves the already focused window alone", async () => {
    const state = await observe();
    expect(state.app).toBe("Editor");
    expect(native.getSources).toHaveBeenCalledTimes(1);
    expect(native.window.focus).not.toHaveBeenCalled();
    expect(native.wait.mock.calls.map(([duration]) => duration)).toEqual([120]);
  });

  it("preserves native bounds on a monitor to the left of the primary display", async () => {
    native.bounds.left = -900;
    const state = await observe();
    expect(state.coordinateSpace.screenX).toBe(-900);
    await host.executeComputerUse("click", "click", { ...target(state), x: 400, y: 300 });
    expect(native.mouse.setPosition).toHaveBeenLastCalledWith({ x: -500, y: 350 });
    expect(native.mouse.setPosition.mock.calls.length).toBeLessThanOrEqual(8);
    expect(native.mouse.move).not.toHaveBeenCalled();
  });

  it("rejects geometry changed by focusing before dispatching input", async () => {
    const state = await observe();
    native.getActiveWindow.mockResolvedValueOnce({ ...native.window, windowHandle: 7 });
    native.window.focus.mockImplementationOnce(async () => {
      native.bounds.left += 100;
      return true;
    });
    await expect(
      host.executeComputerUse("click", "click", { ...target(state), x: 10, y: 10 }),
    ).rejects.toThrow("moved or resized");
    expect(native.mouse.click).not.toHaveBeenCalled();
  });

  it("returns a new usable observation with an action in one request", async () => {
    const state = await observe();
    const result = decodeAction(
      await host.executeComputerUse("click", "click", {
        ...target(state),
        x: 20,
        y: 20,
        observeAfter: true,
      }),
    );
    expect(result?.actionCompleted).toBe(true);
    expect(result?.observation?.observationId).not.toBe(state.observationId);
    expect(native.mouse.click).toHaveBeenCalledTimes(1);
    expect(native.getSources).toHaveBeenCalledTimes(2);
    await host.executeComputerUse("type", "typeText", {
      ...target(result!.observation!),
      text: "ok",
    });
    expect(native.keyboard.type.mock.calls.map(([text]) => text).join("")).toBe("ok");
  });

  it("reports completed input separately when its follow-up capture fails", async () => {
    const state = await observe();
    native.getSources.mockRejectedValueOnce(new Error("Capture unavailable"));
    await expect(
      host.executeComputerUse("click", "click", {
        ...target(state),
        x: 20,
        y: 20,
        observeAfter: true,
      }),
    ).resolves.toEqual({ actionCompleted: true, observationError: "Capture unavailable" });
    expect(native.mouse.click).toHaveBeenCalledTimes(1);
  });

  it("does not refocus the old window when an action opens a new dialog", async () => {
    const state = await observe();
    native.mouse.click.mockImplementationOnce(async () => {
      native.getActiveWindow.mockResolvedValue({
        ...native.window,
        windowHandle: 99,
        title: "Dialog",
      });
    });
    await expect(
      host.executeComputerUse("click", "click", {
        ...target(state),
        x: 20,
        y: 20,
        observeAfter: true,
      }),
    ).resolves.toMatchObject({
      actionCompleted: true,
      observationError: expect.stringContaining("active window changed"),
    });
    expect(native.window.focus).not.toHaveBeenCalled();
  });

  it("invalidates other outstanding observations after input", async () => {
    const first = await observe();
    const second = await observe();
    await host.executeComputerUse("click", "click", { ...target(second), x: 20, y: 20 });
    await expect(
      host.executeComputerUse("stale", "click", { ...target(first), x: 20, y: 20 }),
    ).rejects.toThrow("already used");
    expect(native.mouse.click).toHaveBeenCalledTimes(1);
  });

  it("types Unicode without the default per-character delays and stops between characters", async () => {
    const state = await observe();
    native.keyboard.type.mockImplementationOnce(async () => {
      host.cancelComputerUse("type");
      return undefined;
    });
    await expect(
      host.executeComputerUse("type", "typeText", { ...target(state), text: "👋abc" }),
    ).rejects.toThrow("cancelled");
    expect(native.keyboard.type.mock.calls).toEqual([["👋"]]);
    expect(native.keyboard.config.autoDelayMs).toBe(0);
    expect(native.setKeyboardDelay).toHaveBeenCalledWith(0);
  });

  it("releases shortcut modifiers in the native library's expected order even on failure", async () => {
    const state = await observe();
    native.keyboard.pressKey.mockRejectedValueOnce(new Error("input failed"));
    await expect(
      host.executeComputerUse("key", "pressKey", {
        ...target(state),
        key: "a",
        modifiers: ["Meta"],
      }),
    ).rejects.toThrow("input failed");
    expect(native.keyboard.pressKey).toHaveBeenCalledWith(2, 1);
    expect(native.keyboard.releaseKey).toHaveBeenCalledWith(2, 1);
  });

  it("releases the mouse button when dragging fails", async () => {
    const state = await observe();
    native.mouse.setPosition.mockImplementation(async () => {
      if (native.mouse.pressButton.mock.calls.length > 0) throw new Error("drag failed");
      return undefined;
    });
    await expect(
      host.executeComputerUse("drag", "drag", {
        ...target(state),
        fromX: 10,
        fromY: 10,
        toX: 100,
        toY: 100,
      }),
    ).rejects.toThrow("drag failed");
    expect(native.mouse.releaseButton).toHaveBeenCalledWith(0);
  });

  it("positions unqualified scrolling inside the observed window", async () => {
    const state = await observe();
    await host.executeComputerUse("scroll", "scroll", { ...target(state), deltaY: 3 });
    expect(native.mouse.setPosition).toHaveBeenLastCalledWith({ x: 500, y: 350 });
    expect(native.mouse.scrollDown).toHaveBeenCalledWith(3);
  });

  it("does not double-click after cancellation during cursor movement", async () => {
    const state = await observe();
    native.mouse.setPosition.mockImplementationOnce(async () => {
      host.cancelComputerUse("click");
      return undefined;
    });
    await expect(
      host.executeComputerUse("click", "click", {
        ...target(state),
        x: 10,
        y: 10,
        clickCount: 2,
      }),
    ).rejects.toThrow("cancelled");
    expect(native.mouse.doubleClick).not.toHaveBeenCalled();
  });
});
