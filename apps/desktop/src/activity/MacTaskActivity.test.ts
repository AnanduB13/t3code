import type * as NodeEvents from "node:events";
import * as Electron from "electron";
import {
  RuntimeRequestId,
  EnvironmentId,
  ThreadId,
  type DesktopTaskActivity,
} from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  TASK_ACTIVITY_DISPLAYS_CHANNEL,
  TASK_ACTIVITY_OPEN_CHANNEL,
  TASK_ACTIVITY_PANEL_CHANNEL,
  TASK_ACTIVITY_RESPOND_CHANNEL,
} from "../ipc/channels.ts";
import { MacTaskActivity, taskPanelLayout } from "./MacTaskActivity.ts";
import { readMacScreenNotches, type MacScreenNotch } from "./MacScreenNotch.ts";

type TestDisplay = Pick<Electron.Display, "id" | "label" | "internal" | "bounds" | "workArea">;

const state = vi.hoisted(() => ({
  focused: null as object | null,
  display: {
    id: 1,
    label: "Built-in Retina Display",
    internal: true,
    bounds: { x: 0, y: 0, width: 1512, height: 982 },
    workArea: { x: 0, y: 38, width: 1512, height: 944 },
  },
  extraDisplays: [] as TestDisplay[],
}));
vi.mock("./MacScreenNotch.ts", () => ({ readMacScreenNotches: vi.fn(async () => []) }));
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
    setFocusable = vi.fn();
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
    nativeImage: {
      createFromPath: vi.fn(() => ({
        isEmpty: () => false,
        resize: () => ({ toDataURL: () => "data:image/png;base64,YXBw" }),
      })),
    },
    app: Object.assign(new EventEmitter(), { focus: vi.fn() }),
    screen: Object.assign(new EventEmitter(), {
      getDisplayMatching: () => state.display,
      getAllDisplays: () => [state.display, ...state.extraDisplays],
      getPrimaryDisplay: () => state.display,
    }),
    powerMonitor: new EventEmitter(),
    ipcMain: new EventEmitter(),
  };
});

// Tests retain the mock's real event emitter so native lifecycle events drive the panel.
type MockWindow = NodeEvents.EventEmitter & {
  options: unknown;
  destroyed: boolean;
  visible: boolean;
  minimized: boolean;
  webContents: NodeEvents.EventEmitter & { mainFrame: object; send: ReturnType<typeof vi.fn> };
  setBounds: ReturnType<typeof vi.fn>;
  setAlwaysOnTop: ReturnType<typeof vi.fn>;
  setFocusable: ReturnType<typeof vi.fn>;
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

beforeEach(async () => {
  windows().length = 0;
  state.focused = null;
  state.display = {
    id: 1,
    label: "Built-in Retina Display",
    internal: true,
    bounds: { x: 0, y: 0, width: 1512, height: 982 },
    workArea: { x: 0, y: 38, width: 1512, height: 944 },
  };
  state.extraDisplays = [];
  vi.clearAllMocks();
  vi.mocked(readMacScreenNotches).mockResolvedValue([]);
  owner = new Electron.BrowserWindow({});
  windows()[0]!.visible = true;
  controller = new MacTaskActivity("/bundle/task-activity-preload.cjs");
  await Promise.resolve();
});
afterEach(() => controller.dispose());

describe("macOS task panel", () => {
  it("stays absent in the foreground and appears without focus when minimized", async () => {
    state.focused = owner;
    controller.update(activity, owner);
    expect(windows()).toHaveLength(1);
    // Electron can still return the owner (including its DevTools) during minimize.
    windows()[0]!.minimized = true;
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
      enableLargerThanScreen: true,
      skipTaskbar: true,
    });
    expect(panel.setAlwaysOnTop).toHaveBeenCalledWith(true, "status");
    windows()[0]!.minimized = false;
    owner.emit("restore");
    Electron.app.emit("browser-window-focus", {}, owner);
    expect(panel.hide).toHaveBeenCalled();
  });

  it("shows when the owner is hidden even if Electron still reports its focus", async () => {
    state.focused = owner;
    controller.update(activity, owner);
    owner.hide();
    owner.emit("hide");
    await Promise.resolve();
    const panel = ready();
    expect(panel.showInactive).toHaveBeenCalledOnce();

    owner.show();
    owner.emit("show");
    await Promise.resolve();
    expect(panel.hide).toHaveBeenCalled();
  });

  it("hides behind another focused app window while the owner remains minimized", () => {
    windows()[0]!.minimized = true;
    controller.update(activity, owner);
    const panel = ready();
    const other = new Electron.BrowserWindow({});
    other.show();
    state.focused = other;
    Electron.app.emit("browser-window-focus", {}, other);
    expect(panel.hide).toHaveBeenCalled();
  });

  it("expands to a bounded scrolling list and opens the correct remote thread", () => {
    controller.update({ ...activity, tasks: Array.from({ length: 12 }, () => task) }, owner);
    const panel = ready();
    message("expand");
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: 556, y: 0, width: 400, height: 400 },
      false,
    );
    message("collapse");
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: 556, y: 0, width: 400, height: 400 },
      false,
    );
    message({ action: "collapsed", revision: 2 });
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: 636, y: 0, width: 240, height: 40 },
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

  it("hides while locked and follows display changes on unlock", async () => {
    controller.update(activity, owner);
    const panel = ready();
    Electron.powerMonitor.emit("lock-screen");
    expect(panel.hide).toHaveBeenCalled();
    state.display = {
      id: 2,
      label: "Studio Display",
      internal: false,
      bounds: { x: -1920, y: -900, width: 1920, height: 1080 },
      workArea: { x: -1920, y: -876, width: 1920, height: 1056 },
    };
    Electron.screen.emit("display-removed");
    await Promise.resolve();
    expect(panel.showInactive).toHaveBeenCalledTimes(1);
    Electron.powerMonitor.emit("unlock-screen");
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: -1080, y: -900, width: 240, height: 40 },
      false,
    );
    expect(panel.showInactive).toHaveBeenCalledTimes(2);
  });

  it("reserves the real camera width and removes the gap on an external display", async () => {
    const notch: MacScreenNotch = { displayId: 1, x: 656, width: 200, height: 38 };
    vi.mocked(readMacScreenNotches).mockResolvedValue([notch]);
    Electron.screen.emit("display-metrics-changed");
    await Promise.resolve();
    controller.update(activity, owner);
    const panel = ready();
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: 528, y: 0, width: 456, height: 40 },
      false,
    );
    expect(panel.webContents.send).toHaveBeenLastCalledWith(TASK_ACTIVITY_PANEL_CHANNEL, {
      tasks: activity.tasks,
      branding: { name: "T3 Code", icon: null },
      expanded: false,
      collapsing: false,
      revision: 0,
      layout: { headerHeight: 40, notchWidth: 216, compactWidth: 456, width: 456, height: 120 },
    });
    message("expand");
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: 528, y: 0, width: 456, height: 120 },
      false,
    );
    message("collapse");
    message({ action: "collapsed", revision: 2 });
    controller.update(activity, owner);
    expect(readMacScreenNotches).toHaveBeenCalledTimes(2);

    state.display.id = 2;
    owner.emit("move");
    await Promise.resolve();
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: 636, y: 0, width: 240, height: 40 },
      false,
    );
    expect(panel.webContents.send).toHaveBeenLastCalledWith(TASK_ACTIVITY_PANEL_CHANNEL, {
      tasks: activity.tasks,
      branding: { name: "T3 Code", icon: null },
      expanded: false,
      collapsing: false,
      revision: 2,
      layout: { headerHeight: 40, notchWidth: 0, compactWidth: 240, width: 400, height: 120 },
    });
  });

  it("supplies the edition name and caches the installed app icon for the expanded header", async () => {
    controller.dispose();
    controller = new MacTaskActivity("/bundle/task-activity-preload.cjs", "/bundle/icon.png");
    await Promise.resolve();
    controller.update({ ...activity, appName: "After Dark" }, owner);
    const panel = ready();
    message("expand");
    expect(panel.webContents.send).toHaveBeenLastCalledWith(
      TASK_ACTIVITY_PANEL_CHANNEL,
      expect.objectContaining({
        branding: { name: "After Dark", icon: "data:image/png;base64,YXBw" },
      }),
    );
    expect(Electron.nativeImage.createFromPath).toHaveBeenCalledExactlyOnceWith("/bundle/icon.png");
  });

  it("ignores stale screen geometry after another display change", async () => {
    const stale = Promise.withResolvers<readonly MacScreenNotch[]>();
    vi.mocked(readMacScreenNotches).mockReturnValueOnce(stale.promise);
    Electron.screen.emit("display-metrics-changed");
    Electron.screen.emit("display-metrics-changed");
    await Promise.resolve();
    stale.resolve([{ displayId: 1, x: 656, width: 200, height: 38 }]);
    await stale.promise;
    controller.update(activity, owner);
    const panel = ready();
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: 636, y: 0, width: 240, height: 40 },
      false,
    );
  });

  it("waits for the current closing animation and ignores receipts after a hover reversal", () => {
    controller.update(activity, owner);
    const panel = ready();
    message("expand");
    message("collapse");
    message("expand");
    message({ action: "collapsed", revision: 2 });
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: 556, y: 0, width: 400, height: 120 },
      false,
    );
    message("collapse");
    message({ action: "collapsed", revision: 2 });
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: 556, y: 0, width: 400, height: 120 },
      false,
    );
    message({ action: "collapsed", revision: 4 });
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: 636, y: 0, width: 240, height: 40 },
      false,
    );
  });

  it("keeps a saved monitor preference through disconnect and reconnect", async () => {
    const external: TestDisplay = {
      id: 2,
      label: "Studio Display",
      internal: false,
      bounds: { x: -1920, y: -900, width: 1920, height: 1080 },
      workArea: { x: -1920, y: -876, width: 1920, height: 1056 },
    };
    state.extraDisplays = [external];
    controller.update({ ...activity, displayId: 2 }, owner);
    const panel = ready();
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: -1080, y: -900, width: 240, height: 40 },
      false,
    );
    expect(controller.getDisplays()).toEqual([
      {
        id: 1,
        label: "Built-in Retina Display",
        width: 1512,
        height: 982,
        internal: true,
        primary: true,
      },
      {
        id: 2,
        label: "Studio Display",
        width: 1920,
        height: 1080,
        internal: false,
        primary: false,
      },
    ]);
    state.extraDisplays = [];
    Electron.screen.emit("display-removed");
    await Promise.resolve();
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: 636, y: 0, width: 240, height: 40 },
      false,
    );
    expect(windows()[0]!.webContents.send).toHaveBeenCalledWith(TASK_ACTIVITY_DISPLAYS_CHANNEL);
    state.extraDisplays = [external];
    Electron.screen.emit("display-added");
    await Promise.resolve();
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: -1080, y: -900, width: 240, height: 40 },
      false,
    );
    controller.update({ ...activity, displayId: null }, owner);
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      { x: 636, y: 0, width: 240, height: 40 },
      false,
    );
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

it("keeps the expanded task list inside short, narrow displays", () => {
  expect(
    taskPanelLayout(
      {
        bounds: { x: 0, y: 0, width: 300, height: 300 },
      },
      true,
      50,
    ).bounds,
  ).toEqual({ x: 0, y: 0, width: 300, height: 300 });
});

it("uses notch geometry on scaled displays above and to the left of the primary screen", () => {
  expect(
    taskPanelLayout({ bounds: { x: -1800, y: -1100, width: 1800, height: 1100 } }, true, 1, {
      displayId: 2,
      x: 780,
      width: 240,
      height: 48,
    }),
  ).toEqual({
    bounds: { x: -1148, y: -1100, width: 496, height: 128 },
    headerHeight: 48,
    notchWidth: 256,
    compactWidth: 496,
    expandedWidth: 496,
    expandedHeight: 128,
  });
});

const requestId = RuntimeRequestId.make("layout-question");
const requestTarget = { environmentId: task.environmentId, threadId: task.threadId, requestId };
const questionActivity: DesktopTaskActivity = {
  enabled: true,
  tasks: [
    {
      ...task,
      status: "input",
      requests: [
        {
          kind: "input",
          requestId,
          dismissible: true,
          questions: [
            {
              id: "answer",
              header: "Layout",
              question: "Which display?",
              options: [],
              multiSelect: false,
            },
          ],
        },
      ],
    },
  ],
};

describe("notch request lifecycle", () => {
  it("opens new questions without stealing focus and stays visible when typing in the panel", () => {
    controller.update(questionActivity, owner);
    const panel = ready();
    expect(panel.webContents.send).toHaveBeenLastCalledWith(
      TASK_ACTIVITY_PANEL_CHANNEL,
      expect.objectContaining({
        expanded: true,
        activeRequest: requestTarget,
        layout: expect.objectContaining({ width: 440, height: 500 }),
      }),
    );
    expect(panel.showInactive).toHaveBeenCalled();
    expect(panel.focus).not.toHaveBeenCalled();
    expect(panel.setFocusable).toHaveBeenLastCalledWith(true);
    state.focused = panel;
    const hides = panel.hide.mock.calls.length;
    Electron.app.emit("browser-window-focus", {}, panel);
    expect(panel.hide).toHaveBeenCalledTimes(hides);
  });
  it("keeps Later dismissed across updates, reopens on request, and restores compact geometry after closing", () => {
    controller.update(questionActivity, owner);
    const panel = ready();
    message("collapse");
    const closing = panel.webContents.send.mock.calls.at(-1)![1] as { revision: number };
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 440, height: 500 }),
      false,
    );
    message({ action: "collapsed", revision: closing.revision });
    controller.update(questionActivity, owner);
    expect(panel.webContents.send).toHaveBeenLastCalledWith(
      TASK_ACTIVITY_PANEL_CHANNEL,
      expect.objectContaining({ expanded: false }),
    );
    expect(panel.setBounds).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 240, height: 40 }),
      false,
    );
    expect(panel.setFocusable).toHaveBeenLastCalledWith(false);
    message({ action: "show-request", target: requestTarget });
    expect(panel.webContents.send).toHaveBeenLastCalledWith(
      TASK_ACTIVITY_PANEL_CHANNEL,
      expect.objectContaining({ expanded: true, activeRequest: requestTarget }),
    );
  });
  it("forwards one response at a time and allows retry after a reported failure", () => {
    controller.update(questionActivity, owner);
    const panel = ready();
    const response = { ...requestTarget, kind: "input", answers: { answer: "Built-in display" } };
    message({ action: "respond", response });
    message({ action: "respond", response });
    expect(windows()[0]!.webContents.send).toHaveBeenCalledExactlyOnceWith(
      TASK_ACTIVITY_RESPOND_CHANNEL,
      response,
    );
    controller.responseResult({ ...requestTarget, error: "Connection lost" });
    expect(panel.webContents.send).toHaveBeenLastCalledWith(TASK_ACTIVITY_PANEL_CHANNEL, {
      action: "response-result",
      result: { ...requestTarget, error: "Connection lost" },
    });
    message({ action: "respond", response });
    expect(windows()[0]!.webContents.send).toHaveBeenCalledTimes(2);
  });
  it("rejects stale, malformed and untrusted responses and switches to the next waiting thread", () => {
    const next = {
      ...questionActivity.tasks[0]!,
      environmentId: EnvironmentId.make("another-server"),
    };
    controller.update({ ...questionActivity, tasks: [...questionActivity.tasks, next] }, owner);
    const panel = ready();
    const response = { ...requestTarget, kind: "input", answers: { answer: "First" } };
    message({ action: "respond", response }, false);
    message({ action: "respond", response: { ...response, answers: {} } });
    expect(windows()[0]!.webContents.send).not.toHaveBeenCalledWith(
      TASK_ACTIVITY_RESPOND_CHANNEL,
      expect.anything(),
    );
    controller.update({ ...questionActivity, tasks: [next] }, owner);
    expect(panel.webContents.send).toHaveBeenLastCalledWith(
      TASK_ACTIVITY_PANEL_CHANNEL,
      expect.objectContaining({
        activeRequest: { ...requestTarget, environmentId: next.environmentId },
      }),
    );
    message({ action: "respond", response });
    expect(windows()[0]!.webContents.send).not.toHaveBeenCalledWith(
      TASK_ACTIVITY_RESPOND_CHANNEL,
      response,
    );
    controller.update({ enabled: false, tasks: [] }, owner);
    expect(panel.destroyed).toBe(true);
  });
  it("bounds questions to the selected display, including smaller external monitors", () => {
    expect(
      taskPanelLayout(
        { bounds: { x: -300, y: 0, width: 300, height: 260 } },
        true,
        1,
        undefined,
        true,
      ).bounds,
    ).toEqual({ x: -300, y: 0, width: 300, height: 260 });
  });
});
