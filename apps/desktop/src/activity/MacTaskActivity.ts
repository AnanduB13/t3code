import {
  DesktopTaskTarget,
  DesktopTaskRequestTarget,
  DesktopTaskResponse,
  type DesktopTaskResponseResult,
  type DesktopTaskActivity,
  type DesktopTaskActivityDisplay,
} from "@t3tools/contracts";
import {
  taskRequestKey,
  taskRequests,
  validTaskResponse,
} from "@t3tools/shared/desktopTaskRequests";
import * as Electron from "electron";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  TASK_ACTIVITY_DISPLAYS_CHANNEL,
  TASK_ACTIVITY_OPEN_CHANNEL,
  TASK_ACTIVITY_PANEL_CHANNEL,
  TASK_ACTIVITY_RESPOND_CHANNEL,
} from "../ipc/channels.ts";
import { readMacScreenNotches, type MacScreenNotch } from "./MacScreenNotch.ts";
import {
  taskPanelHtml,
  TASK_PANEL_HEADER_HEIGHT,
  TASK_PANEL_MAX_ROWS,
  TASK_PANEL_ROW_HEIGHT,
  TASK_PANEL_ROW_GAP,
} from "./taskPanelHtml.ts";

const decodeTaskTarget = Schema.decodeUnknownOption(DesktopTaskTarget);
const decodeShowRequest = Schema.decodeUnknownOption(
  Schema.Struct({ action: Schema.Literal("show-request"), target: DesktopTaskRequestTarget }),
);
const decodeResponse = Schema.decodeUnknownOption(
  Schema.Struct({ action: Schema.Literal("respond"), response: DesktopTaskResponse }),
);
const decodeCollapsed = Schema.decodeUnknownOption(
  Schema.Struct({
    action: Schema.Literal("collapsed"),
    revision: Schema.Int,
  }),
);

/** Anchor to the display edge, with equal content wings around the camera cutout. */
export function taskPanelLayout(
  display: Pick<Electron.Display, "bounds">,
  expanded: boolean,
  taskCount: number,
  notch?: MacScreenNotch,
  interactive = false,
) {
  const notchWidth = notch ? Math.ceil(notch.width) + 16 : 0;
  const headerHeight = Math.max(TASK_PANEL_HEADER_HEIGHT, Math.ceil(notch?.height ?? 0));
  // Keep the header and camera gap stationary throughout a hover reveal.
  const compactWidth = Math.min(240 + notchWidth, display.bounds.width);
  const expandedWidth = Math.min(
    Math.max(interactive ? 440 : 400, compactWidth),
    display.bounds.width,
  );
  const width = expanded ? expandedWidth : compactWidth;
  const rows = Math.min(taskCount, TASK_PANEL_MAX_ROWS);
  const expandedHeight = Math.min(
    interactive
      ? headerHeight + 460
      : headerHeight +
          rows * TASK_PANEL_ROW_HEIGHT +
          Math.max(0, rows - 1) * TASK_PANEL_ROW_GAP +
          16,
    display.bounds.height,
  );
  const height = expanded ? expandedHeight : Math.min(headerHeight, display.bounds.height);
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
    compactWidth,
    expandedWidth,
    expandedHeight,
  };
}

/** Background panel; keyboard focus is enabled only while answering a live request. */
export class MacTaskActivity {
  private panel: Electron.BrowserWindow | undefined;
  private owner: Electron.BrowserWindow | undefined;
  private activity: DesktopTaskActivity = { enabled: false, tasks: [] };
  private expanded = false;
  private collapsing = false;
  private revision = 0;
  private ready = false;
  private locked = false;
  private disposed = false;
  private notches: readonly MacScreenNotch[] | undefined;
  private displayGeneration = 0;
  private unbindOwner = () => {};
  private activeRequest: DesktopTaskRequestTarget | null = null;
  private closingRequest: DesktopTaskRequestTarget | null = null;
  private seenRequests = new Set<string>();
  private pendingResponses = new Set<string>();
  private readonly preload: string;
  private readonly appIcon: string | null;

  constructor(preload: string, iconPath?: string) {
    this.preload = preload;
    const icon = iconPath ? Electron.nativeImage.createFromPath(iconPath) : null;
    this.appIcon =
      icon && !icon.isEmpty() ? icon.resize({ width: 32, height: 32 }).toDataURL() : null;
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
    this.expanded = false;
    this.collapsing = false;
    if (this.owner && !this.owner.isDestroyed()) {
      this.owner.webContents.send(TASK_ACTIVITY_DISPLAYS_CHANNEL);
    }
    void readMacScreenNotches().then((notches) => {
      if (this.disposed || generation !== this.displayGeneration) return;
      this.notches = notches;
      this.sync();
    });
  };

  getDisplays(): readonly DesktopTaskActivityDisplay[] {
    const primary = Electron.screen.getPrimaryDisplay().id;
    return Electron.screen.getAllDisplays().map((display, index) => ({
      id: display.id,
      label: display.label || (display.internal ? "Built-in display" : `Display ${index + 1}`),
      width: display.bounds.width,
      height: display.bounds.height,
      internal: display.internal,
      primary: display.id === primary,
    }));
  }

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
    const requests = taskRequests(activity.tasks);
    const keys = new Set(requests.map(({ target }) => taskRequestKey(target)));
    const wasResponding = this.activeRequest !== null;
    if (this.activeRequest && !keys.has(taskRequestKey(this.activeRequest)))
      this.activeRequest = null;
    const next = this.activeRequest
      ? undefined
      : (requests.find(({ target }) => !this.seenRequests.has(taskRequestKey(target))) ??
        (wasResponding ? requests[0] : undefined));
    if (next) {
      this.activeRequest = next.target;
      this.closingRequest = null;
      this.expanded = true;
      this.collapsing = false;
      this.revision++;
    }
    this.seenRequests = keys;
    for (const key of this.pendingResponses) if (!keys.has(key)) this.pendingResponses.delete(key);
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
    this.collapsing = false;
    this.activeRequest = null;
    this.closingRequest = null;
    this.seenRequests.clear();
    this.pendingResponses.clear();
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
      (focused && focused !== this.panel) ||
      !this.notches
    ) {
      this.expanded = false;
      this.collapsing = false;
      this.panel?.hide();
      this.panel?.setFocusable(false);
      return;
    }
    if (!this.panel) this.createPanel();
    const panel = this.panel;
    if (!panel || !this.ready) return;
    if (this.activeRequest) this.expanded = true;
    panel.setFocusable(this.expanded && this.activeRequest !== null);
    const display =
      Electron.screen
        .getAllDisplays()
        .find((candidate) => candidate.id === this.activity.displayId) ??
      Electron.screen.getDisplayMatching(owner.getBounds());
    const layout = taskPanelLayout(
      display,
      this.expanded || this.collapsing,
      this.activity.tasks.length,
      this.notches.find((notch) => notch.displayId === display.id),
      this.activeRequest !== null || this.closingRequest !== null,
    );
    panel.setBounds(layout.bounds, false);
    panel.webContents.send(TASK_ACTIVITY_PANEL_CHANNEL, {
      tasks: this.activity.tasks,
      branding: { name: this.activity.appName?.trim() || "T3 Code", icon: this.appIcon },
      expanded: this.expanded,
      collapsing: this.collapsing,
      revision: this.revision,
      ...(this.activeRequest || this.closingRequest
        ? { activeRequest: this.activeRequest ?? this.closingRequest }
        : {}),
      layout: {
        headerHeight: layout.headerHeight,
        notchWidth: layout.notchWidth,
        compactWidth: layout.compactWidth,
        width: layout.expandedWidth,
        height: layout.expandedHeight,
      },
    });
    if (!panel.isVisible()) panel.showInactive();
  };

  private createPanel() {
    const panel = new Electron.BrowserWindow({
      width: 240,
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
        this.collapsing = false;
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
    else if (action === "expand") {
      if (this.expanded) return;
      this.revision++;
      this.expanded = true;
      this.collapsing = false;
      this.activeRequest ??= this.closingRequest;
      this.closingRequest = null;
    } else if (action === "collapse") {
      if (!this.expanded) return;
      this.revision++;
      this.expanded = false;
      this.collapsing = true;
      this.closingRequest = this.activeRequest;
      this.activeRequest = null;
    } else {
      const showRequest = decodeShowRequest(action);
      if (Option.isSome(showRequest)) {
        const target = showRequest.value.target;
        if (
          !taskRequests(this.activity.tasks).some(
            (entry) => taskRequestKey(entry.target) === taskRequestKey(target),
          )
        )
          return;
        this.activeRequest = target;
        this.closingRequest = null;
        this.expanded = true;
        this.collapsing = false;
        this.revision++;
        this.sync();
        return;
      }
      const response = decodeResponse(action);
      if (Option.isSome(response)) {
        const value = response.value.response;
        const owner = this.owner;
        if (!owner || owner.isDestroyed()) return;
        if (
          !this.activity.enabled ||
          this.locked ||
          !validTaskResponse(this.activity.tasks, value)
        ) {
          panel.webContents.send(TASK_ACTIVITY_PANEL_CHANNEL, {
            action: "response-result",
            result: {
              environmentId: value.environmentId,
              threadId: value.threadId,
              requestId: value.requestId,
              error:
                "This request is no longer available. Open the chat to check its latest state.",
            },
          });
          return;
        }
        const key = taskRequestKey(value);
        if (this.pendingResponses.has(key)) return;
        this.pendingResponses.add(key);
        owner.webContents.send(TASK_ACTIVITY_RESPOND_CHANNEL, value);
        return;
      }
      const collapsed = decodeCollapsed(action);
      if (Option.isSome(collapsed)) {
        if (this.expanded || collapsed.value.revision !== this.revision) return;
        this.collapsing = false;
        this.closingRequest = null;
        this.sync();
        return;
      }
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

  responseResult(result: DesktopTaskResponseResult) {
    if (!this.pendingResponses.delete(taskRequestKey(result))) return;
    this.panel?.webContents.send(TASK_ACTIVITY_PANEL_CHANNEL, {
      action: "response-result",
      result,
    });
  }

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
