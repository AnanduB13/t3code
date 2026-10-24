import { ipcRenderer } from "electron";
import type { DesktopTask } from "@t3tools/contracts";
import { TASK_ACTIVITY_PANEL_CHANNEL } from "./ipc/channels.ts";
import type { TaskPanelMetrics } from "./activity/taskPanelHtml.ts";

// A dedicated sandboxed preload: the panel cannot access the general desktop bridge.
window.addEventListener("DOMContentLoaded", () => {
  const panel = document.getElementById("panel")!;
  const summary = document.getElementById("summary")!;
  const counts = document.getElementById("counts")!;
  const status = document.getElementById("status")!;
  const list = document.getElementById("tasks")!;
  const send = (action: string) => ipcRenderer.send(TASK_ACTIVITY_PANEL_CHANNEL, action);
  panel.addEventListener("mouseenter", () => send("expand"));
  document.documentElement.addEventListener("mouseleave", () => send("collapse"));
  summary.addEventListener("click", () => {
    send(panel.hasAttribute("data-expanded") ? "collapse" : "expand");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") send("collapse");
  });
  ipcRenderer.on(
    TASK_ACTIVITY_PANEL_CHANNEL,
    (
      _event,
      {
        tasks,
        expanded,
        layout,
      }: { tasks: readonly DesktopTask[]; expanded: boolean; layout: TaskPanelMetrics },
    ) => {
      panel.style.setProperty("--header-height", `${layout.headerHeight}px`);
      panel.style.setProperty("--notch-width", `${layout.notchWidth}px`);
      panel.style.setProperty("--panel-height", `${layout.height}px`);
      panel.toggleAttribute("data-expanded", expanded);
      summary.setAttribute("aria-expanded", String(expanded));
      summary.setAttribute(
        "aria-label",
        expanded ? "Collapse running tasks" : "Show running tasks",
      );
      const attention = tasks.filter(
        (task) => task.status === "approval" || task.status === "input",
      );
      const running = tasks.filter((task) => task.status === "running").length;
      const monitoring = tasks.filter((task) => task.status === "monitoring").length;
      counts.textContent = [
        running ? `${running} running` : "",
        attention.length ? `${attention.length} needs you` : "",
        monitoring ? `${monitoring} watching` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      summary.title = counts.textContent;
      status.dataset.status = attention[0]?.status ?? tasks[0]?.status ?? "running";
      const buttons = tasks.map((task) => {
        const button = document.createElement("button");
        button.className = "task";
        button.title = `${task.title}\n${task.project} · ${task.detail}`;
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.dataset.status = task.status;
        const copy = document.createElement("span");
        copy.className = "copy";
        const title = document.createElement("span");
        title.className = "title";
        title.textContent = task.title;
        const detail = document.createElement("span");
        detail.className = "detail";
        detail.textContent = `${task.project} · ${task.detail}`;
        const arrow = document.createElement("span");
        arrow.className = "arrow";
        arrow.textContent = "↗";
        arrow.setAttribute("aria-hidden", "true");
        copy.append(title, detail);
        button.append(dot, copy, arrow);
        button.addEventListener("click", () => {
          ipcRenderer.send(TASK_ACTIVITY_PANEL_CHANNEL, {
            environmentId: task.environmentId,
            threadId: task.threadId,
          });
        });
        return button;
      });
      list.replaceChildren(...buttons);
    },
  );
  send("ready");
});
