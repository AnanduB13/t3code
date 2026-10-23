import type * as NodeEvents from "node:events";
import * as Electron from "electron";
import { EnvironmentId, ThreadId, type DesktopTaskActivity } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TASK_ACTIVITY_OPEN_CHANNEL, TASK_ACTIVITY_PANEL_CHANNEL } from "../ipc/channels.ts";
import { MacTaskActivity, taskPanelBounds } from "./MacTaskActivity.ts";

const state = vi.hoisted(() => ({
  focused: null as object | null,
  display: {
    bounds: { x: 0, y: 0, width: 1512, height: 982 },
    workArea: { x: 0, y: 38, width: 1512, height: 944 },
  },
}));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  class BrowserWindow extends EventEmitter {
    static windows: BrowserWindow[] = [];
    static getFocusedWindow = () => state.focused;
    destroyed = false;
    visible = false;
    minimized = false;
    options: unknown;
    webContents = Object.assign(new EventEmitter(), {
      mainFrame: {},
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    });
    constructor(options: unknown) {
      super();
      this.options = options;
      BrowserWindow.windows.push(this);
    }
    isDestroyed = () => this.destroyed;
    isVisible = () => this.visible;
    isMinimized = () => this.minimized;
    getBounds = () => ({ x: 0, y: 100, width: 900, height: 700 });
    setBounds = vi.fn();
    setAlwaysOnTop = vi.fn();
    setVisibleOnAllWorkspaces = vi.fn();
    loadURL = vi.fn(() => Promise.resolve());
    hide = vi.fn(() => {
      this.visible = false;
    });
    showInactive = vi.fn(() => {
      this.visible = true;
    });
    restore = vi.fn(() => {
      this.minimized = false;
    });
    show = vi.fn(() => {
      this.visible = true;
    });
    focus = vi.fn(() => {
      state.focused = this;
    });
    destroy() {
      this.destroyed = true;
      this.emit("closed");
    }
  }
  return {
    BrowserWindow,
    app: Object.assign(new EventEmitter(), { focus: vi.fn() }),
    screen: Object.assign(new EventEmitter(), { getDisplayMatching: () => state.display }),
    powerMonitor: new EventEmitter(),
    ipcMain: new EventEmitter(),
  };
});

// Tests retain the mock's real event emitter so native lifecycle events drive the panel.
type MockWindow = NodeEvents.EventEmitter & {
  options: unknown;
  destroyed: boolean;
  minimized: boolean;
  webContents: NodeEvents.EventEmitter & { mainFrame: object; send: ReturnType<typeof vi.fn> };
  setBounds: ReturnType<typeof vi.fn>;
  showInactive: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
};
const windows = () => (Electron.BrowserWindow as unknown as { windows: MockWindow[] }).windows;
const task = {
  environmentId: EnvironmentId.make("remote-env"),
  threadId: ThreadId.make("thread-1"),
  title: "Run tests",
  project: "T3 Code",
  detail: "Agent is working",
  status: "running" as const,
};
const activity: DesktopTaskActivity = { enabled: true, tasks: [task] };
let controller: MacTaskActivity;
let owner: Electron.BrowserWindow;
const message = (action: unknown, trusted = true) => {
  const panel = windows().at(-1)!;
  Electron.ipcMain.emit(
    TASK_ACTIVITY_PANEL_CHANNEL,
    {
      sender: trusted ? panel.webContents : {},
      senderFrame: panel.webContents.mainFrame,
    },
    action,
  );
};
const ready = () => {
  message("ready");
  return windows().at(-1)!;
};

beforeEach(() => {
  windows().length = 0;
  state.focused = null;
  state.display = {
    bounds: { x: 0, y: 0, width: 1512, height: 982 },
    workArea: { x: 0, y: 38, width: 1512, height: 944 },
  };
  vi.clearAllMocks();
  owner = new Electron.BrowserWindow({});
  controller = new MacTaskActivity("/bundle/task-activity-preload.cjs");
});
afterEach(() => controller.dispose());

describe("macOS task panel", () => {
  it("stays absent in the foreground and appears without focus when minimized", async () => {
    state.focused = owner;
    controller.update(activity, owner);
    expect(windows()).toHaveLength(1);
    state.focused = null;
    owner.emit("minimize");
    await Promise.resolve();
    const panel = ready();
    expect(panel.showInactive).toHaveBeenCalledOnce();
    expect(panel.focus).not.toHaveBeenCalled();
    expect(panel.options).toMatchObject({
      focusable: false,
      type: "panel",
      acceptFirstMouse: true,
      frame: false,
      skipTaskbar: true,
    });
    state.focused = owner;
    Electron.app.emit("browser-window-focus", {}, owner);
    expect(panel.hide).toHaveBeenCalled();
  });

  it("expands to a bounded scrolling list and opens the correct remote thread", () => {
    controller.update({ ...activity, tasks: Array.from({ length: 12 }, () => task) }, owner);
    const panel = ready();
    message("expand");
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: 552, y: 40, width: 408, height: 368 },
      false,
    );
    message("collapse");
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: 596, y: 40, width: 320, height: 40 },
      false,
    );
    const mockOwner = windows()[0]!;
    mockOwner.minimized = true;
    message({ environmentId: task.environmentId, threadId: task.threadId });
    expect(mockOwner.webContents.send).toHaveBeenCalledWith(TASK_ACTIVITY_OPEN_CHANNEL, {
      environmentId: task.environmentId,
      threadId: task.threadId,
    });
    expect(mockOwner.restore).toHaveBeenCalledOnce();
    expect(mockOwner.show).toHaveBeenCalledOnce();
    expect(mockOwner.focus).toHaveBeenCalledOnce();
  });

  it("rejects other windows and stale task targets", () => {
    controller.update(activity, owner);
    ready();
    message(task, false);
    message({ ...task, threadId: "no-longer-running" });
    message({ environmentId: task.environmentId });
    expect(windows()[0]!.webContents.send).not.toHaveBeenCalled();
  });

  it("removes completed work, supports disable/re-enable, and clears on reload", () => {
    controller.update(activity, owner);
    const panel = ready();
    controller.update({ enabled: true, tasks: [] }, owner);
    expect(panel.destroyed).toBe(true);
    controller.update(activity, owner);
    const second = ready();
    controller.update({ ...activity, enabled: false }, owner);
    expect(second.destroyed).toBe(true);
    controller.update(activity, owner);
    const third = ready();
    owner.webContents.emit("did-start-loading");
    expect(third.destroyed).toBe(true);
    Electron.app.emit("browser-window-blur");
    expect(windows()).toHaveLength(4);
  });

  it("hides while locked and follows display changes on unlock", () => {
    controller.update(activity, owner);
    const panel = ready();
    Electron.powerMonitor.emit("lock-screen");
    expect(panel.hide).toHaveBeenCalled();
    state.display = {
      bounds: { x: -1920, y: -900, width: 1920, height: 1080 },
      workArea: { x: -1920, y: -876, width: 1920, height: 1056 },
    };
    Electron.screen.emit("display-removed");
    expect(panel.showInactive).toHaveBeenCalledTimes(1);
    Electron.powerMonitor.emit("unlock-screen");
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: -1120, y: -860, width: 320, height: 40 },
      false,
    );
    expect(panel.showInactive).toHaveBeenCalledTimes(2);
  });

  it("cleans up native listeners and windows on disposal", () => {
    controller.update(activity, owner);
    const panel = ready();
    controller.dispose();
    expect(panel.destroyed).toBe(true);
    expect(Electron.ipcMain.listenerCount(TASK_ACTIVITY_PANEL_CHANNEL)).toBe(0);
    expect(Electron.screen.listenerCount("display-added")).toBe(0);
    expect(Electron.app.listenerCount("browser-window-focus")).toBe(0);
    expect(owner.listenerCount("closed")).toBe(0);
  });
});

it("keeps a panel on narrow displays inside the screen with an auto-hidden menu bar", () => {
  expect(
    taskPanelBounds(
      {
        bounds: { x: 0, y: 0, width: 300, height: 300 },
        workArea: { x: 0, y: 0, width: 300, height: 300 },
      },
      true,
      50,
    ),
  ).toEqual({ x: 0, y: 40, width: 300, height: 260 });
});
