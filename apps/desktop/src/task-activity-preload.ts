// @effect-diagnostics globalDate:off -- Sandboxed preload uses the browser clock without an Effect runtime.
// @effect-diagnostics globalTimers:off -- One browser timer runs only while the panel is visible.
import { ipcRenderer } from "electron";
import type {
  DesktopTask,
  DesktopTaskRequestTarget,
  DesktopTaskResponseResult,
} from "@t3tools/contracts";
import { TASK_ACTIVITY_PANEL_CHANNEL } from "./ipc/channels.ts";
import type { TaskPanelMetrics } from "./activity/taskPanelHtml.ts";
import { createTaskPanelRequests } from "./activity/taskPanelRequests.ts";
import {
  currentTask,
  formatTaskElapsed,
  nextTask,
  taskKey,
  TASK_PANEL_ROTATION_MS,
} from "./activity/taskPanelState.ts";

// A dedicated sandboxed preload: the panel cannot access the general desktop bridge.
window.addEventListener(
  "DOMContentLoaded",
  () => {
    const panel = document.getElementById("panel")!;
    const summary = document.getElementById("summary")!;
    const identity = document.getElementById("identity")!;
    const metadata = document.getElementById("metadata")!;
    const list = document.getElementById("tasks")!;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let initialized = false;
    let updateId = 0;
    let previousContent = "";
    let tasks: readonly DesktopTask[] = [];
    let branding: { name: string; icon: string | null } = { name: "T3 Code", icon: null };
    let activeKey: string | null = null;
    let expanded = false;
    let activeRequest: DesktopTaskRequestTarget | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const clocks = new Map<string, HTMLElement>();
    const send = (action: string) => ipcRenderer.send(TASK_ACTIVITY_PANEL_CHANNEL, action);
    const openTask = (task: DesktopTask) =>
      ipcRenderer.send(TASK_ACTIVITY_PANEL_CHANNEL, {
        environmentId: task.environmentId,
        threadId: task.threadId,
      });
    const showRequest = (target: DesktopTaskRequestTarget) =>
      ipcRenderer.send(TASK_ACTIVITY_PANEL_CHANNEL, { action: "show-request", target });
    const requests = createTaskPanelRequests({
      container: list,
      projectIcon,
      modelIcon,
      onShowRequest: showRequest,
      onRespond: (response) =>
        ipcRenderer.send(TASK_ACTIVITY_PANEL_CHANNEL, { action: "respond", response }),
      onLater: () => send("collapse"),
      onOpen: openTask,
    });
    panel.addEventListener("mouseenter", () => send("expand"));
    document.documentElement.addEventListener("mouseleave", () => {
      if (!activeRequest) send("collapse");
    });
    summary.addEventListener("click", () => {
      requests.dispose();
      send(expanded ? "collapse" : "expand");
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (activeRequest) {
        requests.keydown(event);
        return;
      }
      if (event.key === "Escape") send("collapse");
    };
    document.addEventListener("keydown", onKeyDown);

    function projectIcon(task: DesktopTask) {
      const icon = document.createElement("span");
      icon.className = "project-icon";
      icon.setAttribute("aria-hidden", "true");
      const fallback = document.createElement("span");
      fallback.textContent = Array.from(task.project).slice(0, 2).join("").toUpperCase();
      icon.append(fallback);
      if (task.projectIcon) {
        const image = document.createElement("img");
        image.src = task.projectIcon;
        image.alt = "";
        image.addEventListener(
          "error",
          () => {
            image.remove();
            fallback.hidden = false;
          },
          { once: true },
        );
        image.addEventListener(
          "load",
          () => {
            fallback.hidden = true;
          },
          { once: true },
        );
        icon.append(image);
      }
      return icon;
    }

    function replaceSummaryPart(slot: HTMLElement, content: HTMLElement, animate: boolean) {
      const previous = slot.lastElementChild;
      for (const child of slot.children)
        child.getAnimations().forEach((animation) => animation.cancel());
      slot.replaceChildren(content);
      if (!animate || reducedMotion.matches || !previous) return;
      previous.setAttribute("aria-hidden", "true");
      slot.prepend(previous);
      void previous
        .animate(
          [
            { opacity: 1, transform: "translateY(0)" },
            { opacity: 0, transform: "translateY(-5px)" },
          ],
          { duration: 120, easing: "ease-out", fill: "forwards" },
        )
        .finished.catch(() => undefined)
        .then(() => previous.remove());
      content.animate(
        [
          { opacity: 0, transform: "translateY(5px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }

    function modelIcon(task: DesktopTask) {
      const icon = document.createElement("span");
      icon.className = "model-icon";
      icon.title = task.model ?? "Model unavailable";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "◇";
      if (task.modelIcon) {
        const image = document.createElement("img");
        image.src = task.modelIcon;
        image.alt = "";
        image.addEventListener("error", () => icon.replaceChildren("◇"), { once: true });
        icon.replaceChildren(image);
      }
      return icon;
    }

    function renderSummary(animate: boolean) {
      if (expanded) {
        const left = document.createElement("span");
        left.className = "summary-identity";
        const icon = document.createElement("span");
        icon.className = "app-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "T3";
        if (branding.icon) {
          const image = document.createElement("img");
          image.src = branding.icon;
          image.alt = "";
          image.addEventListener("error", () => icon.replaceChildren("T3"), { once: true });
          icon.replaceChildren(image);
        }
        const name = document.createElement("span");
        name.className = "app-name";
        name.textContent = branding.name;
        left.append(icon, name);
        const right = document.createElement("span");
        right.className = "summary-metadata";
        const count = document.createElement("span");
        count.className = "task-count";
        count.textContent = `${tasks.filter((task) => task.status === "running").length} running`;
        right.append(count);
        replaceSummaryPart(identity, left, false);
        replaceSummaryPart(metadata, right, false);
        delete summary.dataset.status;
        summary.title = `${branding.name} · ${count.textContent}`;
        summary.setAttribute("aria-label", `Hide tasks: ${branding.name}, ${count.textContent}`);
        return;
      }
      const task = currentTask(tasks, activeKey);
      if (!task) {
        identity.replaceChildren();
        metadata.replaceChildren();
        activeKey = null;
        return;
      }
      activeKey = taskKey(task);
      const left = document.createElement("span");
      left.className = "summary-identity";
      const title = document.createElement("span");
      title.className = "summary-title";
      title.textContent = task.title;
      left.append(projectIcon(task), title);
      const right = document.createElement("span");
      right.className = "summary-metadata";
      const time = document.createElement("span");
      time.className = "elapsed";
      time.textContent = formatTaskElapsed(task, Date.now());
      right.append(modelIcon(task), time);
      replaceSummaryPart(identity, left, animate);
      replaceSummaryPart(metadata, right, animate);
      summary.dataset.status = task.status;
      updateSummaryClock(task, time);
    }

    function updateSummaryClock(task: DesktopTask, clock: Element) {
      const elapsed = formatTaskElapsed(task, Date.now());
      clock.textContent = elapsed;
      summary.title = `${task.title}\n${task.project} · ${task.detail}\n${task.model ?? ""} · ${elapsed}`;
      summary.setAttribute(
        "aria-label",
        `${expanded ? "Hide" : "Show"} tasks: ${task.title}, ${task.model ?? "model unavailable"}, ${elapsed}`,
      );
    }

    function updateClocks() {
      const now = Date.now();
      requests.updateClock(now);
      for (const task of tasks) {
        const clock = clocks.get(taskKey(task));
        if (clock) clock.textContent = formatTaskElapsed(task, now);
      }
    }

    function tick() {
      if (document.visibilityState === "hidden") return;
      if (!expanded && tasks.length > 1) {
        const next = nextTask(tasks, activeKey);
        activeKey = next ? taskKey(next) : null;
        renderSummary(true);
      } else if (!expanded) {
        const task = currentTask(tasks, activeKey);
        const clock = metadata.lastElementChild?.querySelector(".elapsed");
        if (task && clock) updateSummaryClock(task, clock);
      }
      if (expanded) updateClocks();
    }

    function syncTimer() {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      if (tasks.length && document.visibilityState !== "hidden")
        timer = setInterval(tick, TASK_PANEL_ROTATION_MS);
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") requests.dispose();
      renderSummary(false);
      if (expanded) updateClocks();
      syncTimer();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener(
      "unload",
      () => {
        if (timer !== undefined) clearInterval(timer);
        requests.dispose();
        document.removeEventListener("visibilitychange", onVisibilityChange);
        document.removeEventListener("keydown", onKeyDown);
      },
      { once: true },
    );

    ipcRenderer.on(
      TASK_ACTIVITY_PANEL_CHANNEL,
      (
        _event,
        state:
          | { action: "response-result"; result: DesktopTaskResponseResult }
          | {
              tasks: readonly DesktopTask[];
              expanded: boolean;
              collapsing: boolean;
              revision: number;
              layout: TaskPanelMetrics;
              branding?: { name: string; icon: string | null };
              activeRequest?: DesktopTaskRequestTarget;
            },
      ) => {
        if ("action" in state) {
          requests.result(state.result);
          return;
        }
        const currentUpdate = ++updateId;
        const { layout, collapsing, revision } = state;
        const wasExpanded = expanded;
        expanded = state.expanded;
        activeRequest = state.activeRequest ?? null;
        tasks = state.tasks;
        branding = state.branding ?? branding;
        panel.style.setProperty("--header-height", `${layout.headerHeight}px`);
        panel.style.setProperty("--notch-width", `${layout.notchWidth}px`);
        panel.style.setProperty("--compact-width", `${layout.compactWidth}px`);
        panel.style.setProperty("--panel-width", `${layout.width}px`);
        panel.style.setProperty("--panel-height", `${layout.height}px`);
        panel.toggleAttribute("data-expanded", expanded);
        list.inert = !expanded;
        list.setAttribute("aria-hidden", String(!expanded));
        if (!initialized) {
          panel.getBoundingClientRect();
          panel.setAttribute("data-motion-ready", "");
          initialized = true;
        }
        if (collapsing)
          requestAnimationFrame(() => {
            if (updateId !== currentUpdate) return;
            // The native window shrinks only when this closing reveal has settled.
            void Promise.allSettled(
              panel.getAnimations().map((animation) => animation.finished),
            ).then(() => {
              if (updateId === currentUpdate && !expanded)
                ipcRenderer.send(TASK_ACTIVITY_PANEL_CHANNEL, { action: "collapsed", revision });
            });
          });
        summary.setAttribute("aria-expanded", String(expanded));
        const showingRequest = requests.render(tasks, activeRequest);
        const serialized = JSON.stringify([tasks, branding, activeRequest]);
        if (serialized === previousContent) {
          if (wasExpanded !== expanded) renderSummary(false);
          if (expanded) updateClocks();
          return;
        }
        previousContent = serialized;
        renderSummary(false);
        // Equivalent shell updates leave the rotation deadline alone.
        if (timer === undefined || tasks.length === 0) syncTimer();
        clocks.clear();
        if (showingRequest) {
          requests.updateClock(Date.now());
          return;
        }
        const buttons = tasks.map((task) => {
          const button = document.createElement("button");
          button.className = "task";
          button.dataset.status = task.status;
          button.title = `${task.title}\n${task.project} · ${task.detail}\n${task.model ?? ""}`;
          const copy = document.createElement("span");
          copy.className = "copy";
          const title = document.createElement("span");
          title.className = "title";
          title.textContent = task.title;
          const detail = document.createElement("span");
          detail.className = "detail";
          detail.textContent = `${task.project} · ${task.detail}`;
          copy.append(title, detail);
          const meta = document.createElement("span");
          meta.className = "task-metadata";
          const time = document.createElement("span");
          time.className = "elapsed";
          time.textContent = formatTaskElapsed(task, Date.now());
          clocks.set(taskKey(task), time);
          const model = document.createElement("span");
          model.className = "model";
          model.textContent = task.model ?? "";
          const timing = document.createElement("span");
          timing.className = "timing";
          timing.append(modelIcon(task), time);
          meta.append(timing, model);
          button.append(projectIcon(task), copy, meta);
          button.addEventListener("click", () => {
            const request = task.requests?.[0];
            if (request)
              showRequest({
                environmentId: task.environmentId,
                threadId: task.threadId,
                requestId: request.requestId,
              });
            else openTask(task);
          });
          return button;
        });
        list.replaceChildren(...buttons);
      },
    );
    send("ready");
  },
  { once: true },
);
