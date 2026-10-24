import { DesktopTaskTarget, type DesktopTaskActivity } from "@t3tools/contracts";
import * as Electron from "electron";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { TASK_ACTIVITY_OPEN_CHANNEL, TASK_ACTIVITY_PANEL_CHANNEL } from "../ipc/channels.ts";
import { readMacScreenNotches, type MacScreenNotch } from "./MacScreenNotch.ts";
import {
  taskPanelHtml,
  TASK_PANEL_HEADER_HEIGHT,
  TASK_PANEL_MAX_ROWS,
  TASK_PANEL_ROW_HEIGHT,
} from "./taskPanelHtml.ts";

const decodeTaskTarget = Schema.decodeUnknownOption(DesktopTaskTarget);

/** Anchor to the display edge, with equal content wings around the camera cutout. */
export function taskPanelLayout(
  display: Pick<Electron.Display, "bounds">,
  expanded: boolean,
  taskCount: number,
  notch?: MacScreenNotch,
) {
  const notchWidth = notch ? Math.ceil(notch.width) + 16 : 0;
  const headerHeight = Math.max(TASK_PANEL_HEADER_HEIGHT, Math.ceil(notch?.height ?? 0));
  const width = Math.min((expanded ? 408 : 320) + notchWidth, display.bounds.width);
  const height = Math.min(
    headerHeight +
      (expanded ? Math.min(taskCount, TASK_PANEL_MAX_ROWS) * TASK_PANEL_ROW_HEIGHT + 8 : 0),
    display.bounds.height,
  );
  const center = notch ? notch.x + notch.width / 2 : display.bounds.width / 2;
  return {
    bounds: {
      x:
        display.bounds.x +
        Math.round(Math.max(0, Math.min(center - width / 2, display.bounds.width - width))),
      y: display.bounds.y,
      width,
      height,
    },
    headerHeight,
    notchWidth,
  };
}

/** One non-activating panel. Its state comes only from the main renderer's live shells. */
export class MacTaskActivity {
  private panel: Electron.BrowserWindow | undefined;
  private owner: Electron.BrowserWindow | undefined;
  private activity: DesktopTaskActivity = { enabled: false, tasks: [] };
  private expanded = false;
  private ready = false;
  private locked = false;
  private disposed = false;
  private notches: readonly MacScreenNotch[] | undefined;
  private displayGeneration = 0;
  private unbindOwner = () => {};
  private readonly preload: string;

  constructor(preload: string) {
    this.preload = preload;
    Electron.app.on("browser-window-focus", this.sync);
    Electron.app.on("browser-window-blur", this.syncAfterEvent);
    Electron.screen.on("display-added", this.refreshDisplays);
    Electron.screen.on("display-removed", this.refreshDisplays);
    Electron.screen.on("display-metrics-changed", this.refreshDisplays);
    Electron.powerMonitor.on("lock-screen", this.lock);
    Electron.powerMonitor.on("suspend", this.lock);
    Electron.powerMonitor.on("unlock-screen", this.unlock);
    Electron.powerMonitor.on("resume", this.unlock);
    Electron.ipcMain.on(TASK_ACTIVITY_PANEL_CHANNEL, this.onPanelMessage);
    this.refreshDisplays();
  }

  private refreshDisplays = () => {
    const generation = ++this.displayGeneration;
    this.notches = undefined;
    this.panel?.hide();
    void readMacScreenNotches().then((notches) => {
      if (this.disposed || generation !== this.displayGeneration) return;
      this.notches = notches;
      this.sync();
    });
  };

  update(activity: DesktopTaskActivity, owner: Electron.BrowserWindow) {
    if (this.disposed) return;
    if (owner !== this.owner) {
      this.unbindOwner();
      this.owner = owner;
      owner.on("hide", this.syncAfterEvent);
      owner.on("show", this.syncAfterEvent);
      owner.on("minimize", this.syncAfterEvent);
      owner.on("restore", this.syncAfterEvent);
      owner.on("move", this.syncAfterEvent);
      owner.on("closed", this.clear);
      owner.webContents.on("did-start-loading", this.clear);
      owner.webContents.on("render-process-gone", this.clear);
      this.unbindOwner = () => {
        owner.removeListener("hide", this.syncAfterEvent);
        owner.removeListener("show", this.syncAfterEvent);
        owner.removeListener("minimize", this.syncAfterEvent);
        owner.removeListener("restore", this.syncAfterEvent);
        owner.removeListener("move", this.syncAfterEvent);
        owner.removeListener("closed", this.clear);
        owner.webContents.removeListener("did-start-loading", this.clear);
        owner.webContents.removeListener("render-process-gone", this.clear);
      };
    }
    this.activity = activity;
    if (!activity.enabled || activity.tasks.length === 0) this.destroyPanel();
    this.sync();
  }

  private lock = () => {
    this.locked = true;
    this.sync();
  };
  private unlock = () => {
    this.locked = false;
    this.sync();
  };
  private syncAfterEvent = () => {
    queueMicrotask(this.sync);
  };
  private clear = () => {
    this.activity = { enabled: false, tasks: [] };
    this.destroyPanel();
  };

  private destroyPanel() {
    this.ready = false;
    this.expanded = false;
    this.panel?.destroy();
    this.panel = undefined;
  }

  private sync = () => {
    if (this.disposed) return;
    const owner = this.owner;
    const focused = Electron.BrowserWindow.getFocusedWindow();
    if (
      !owner ||
      owner.isDestroyed() ||
      !this.activity.enabled ||
      this.activity.tasks.length === 0 ||
      this.locked ||
      focused ||
      !this.notches
    ) {
      this.expanded = false;
      this.panel?.hide();
      return;
    }
    if (!this.panel) this.createPanel();
    const panel = this.panel;
    if (!panel || !this.ready) return;
    const display = Electron.screen.getDisplayMatching(owner.getBounds());
    const layout = taskPanelLayout(
      display,
      this.expanded,
      this.activity.tasks.length,
      this.notches.find((notch) => notch.displayId === display.id),
    );
    panel.setBounds(layout.bounds, false);
    panel.webContents.send(TASK_ACTIVITY_PANEL_CHANNEL, {
      tasks: this.activity.tasks,
      expanded: this.expanded,
      layout: {
        headerHeight: layout.headerHeight,
        notchWidth: layout.notchWidth,
        height: layout.bounds.height,
      },
    });
    if (!panel.isVisible()) panel.showInactive();
  };

  private createPanel() {
    const panel = new Electron.BrowserWindow({
      width: 320,
      height: TASK_PANEL_HEADER_HEIGHT,
      show: false,
      frame: false,
      // Frameless windows otherwise get constrained below the macOS menu bar.
      enableLargerThanScreen: true,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      roundedCorners: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      type: "panel",
      acceptFirstMouse: true,
      hiddenInMissionControl: true,
      skipTaskbar: true,
      title: "T3 Code task activity",
      webPreferences: {
        preload: this.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.panel = panel;
    panel.setAlwaysOnTop(true, "status");
    panel.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    panel.webContents.on("will-navigate", (event) => event.preventDefault());
    panel.webContents.on("render-process-gone", this.clear);
    panel.once("closed", () => {
      if (this.panel === panel) {
        this.panel = undefined;
        this.ready = false;
        this.expanded = false;
      }
    });
    void panel
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(taskPanelHtml)}`)
      .catch(() => {
        if (this.panel === panel) this.destroyPanel();
      });
  }

  private onPanelMessage = (event: Electron.IpcMainEvent, action: unknown) => {
    const panel = this.panel;
    if (
      !panel ||
      event.sender !== panel.webContents ||
      event.senderFrame !== panel.webContents.mainFrame
    )
      return;
    if (action === "ready") this.ready = true;
    else if (action === "expand") this.expanded = true;
    else if (action === "collapse") this.expanded = false;
    else {
      const target = decodeTaskTarget(action);
      const owner = this.owner;
      if (Option.isNone(target) || !owner || owner.isDestroyed()) return;
      if (
        !this.activity.tasks.some(
          (task) =>
            task.environmentId === target.value.environmentId &&
            task.threadId === target.value.threadId,
        )
      )
        return;
      owner.webContents.send(TASK_ACTIVITY_OPEN_CHANNEL, target.value);
      panel.hide();
      if (owner.isMinimized()) owner.restore();
      owner.show();
      Electron.app.focus({ steal: true });
      owner.focus();
      return;
    }
    this.sync();
  };

  dispose() {
    this.disposed = true;
    this.unbindOwner();
    this.destroyPanel();
    Electron.app.removeListener("browser-window-focus", this.sync);
    Electron.app.removeListener("browser-window-blur", this.syncAfterEvent);
    Electron.screen.removeListener("display-added", this.refreshDisplays);
    Electron.screen.removeListener("display-removed", this.refreshDisplays);
    Electron.screen.removeListener("display-metrics-changed", this.refreshDisplays);
    Electron.powerMonitor.removeListener("lock-screen", this.lock);
    Electron.powerMonitor.removeListener("suspend", this.lock);
    Electron.powerMonitor.removeListener("unlock-screen", this.unlock);
    Electron.powerMonitor.removeListener("resume", this.unlock);
    Electron.ipcMain.removeListener(TASK_ACTIVITY_PANEL_CHANNEL, this.onPanelMessage);
  }
}
