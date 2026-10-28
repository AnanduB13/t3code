// @vitest-environment jsdom
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeVM from "node:vm";
import { build } from "vite-plus/pack";
import { assert, it, vi } from "vite-plus/test";

import { taskPanelHtml } from "../src/activity/taskPanelHtml.ts";
import { TASK_ACTIVITY_PANEL_CHANNEL } from "../src/ipc/channels.ts";
import desktopConfig from "../vite.config.ts";

it("renders task activity and questions from the packaged sandboxed preload", async () => {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-notch-preload-"));
  try {
    assert.ok(Array.isArray(desktopConfig.pack));
    const packConfig = desktopConfig.pack.find(
      (config) =>
        Array.isArray(config.entry) && config.entry.includes("src/task-activity-preload.ts"),
    );
    assert.ok(packConfig);
    await build({
      ...packConfig,
      config: false,
      cwd: NodePath.resolve(import.meta.dirname, ".."),
      outDir: directory,
      sourcemap: false,
      logLevel: "silent",
    });

    const source = await NodeFSP.readFile(
      NodePath.join(directory, "task-activity-preload.cjs"),
      "utf8",
    );
    const parsed = new DOMParser().parseFromString(taskPanelHtml, "text/html");
    document.body.replaceChildren(...parsed.body.childNodes);
    Object.defineProperty(Element.prototype, "getAnimations", {
      configurable: true,
      value: () => [],
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T10:05:00Z"));
    const ipcRenderer = { on: vi.fn(), send: vi.fn() };
    NodeVM.runInNewContext(
      source,
      {
        window,
        document,
        Date,
        matchMedia: () => ({ matches: false }),
        setInterval,
        clearInterval,
        setTimeout,
        clearTimeout,
        require: (specifier) => {
          assert.equal(specifier, "electron", `Unsupported sandbox import: ${specifier}`);
          return { ipcRenderer };
        },
      },
      { filename: "task-activity-preload.cjs", timeout: 1_000 },
    );
    window.dispatchEvent(new Event("DOMContentLoaded"));
    assert.equal(ipcRenderer.send.mock.calls.length, 1);
    assert.deepEqual(ipcRenderer.send.mock.calls[0], [TASK_ACTIVITY_PANEL_CHANNEL, "ready"]);
    const update = ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === TASK_ACTIVITY_PANEL_CHANNEL,
    )?.[1];
    assert.ok(update);
    const task = {
      environmentId: "remote",
      threadId: "one",
      title: "Fix notch visibility",
      project: "After Dark",
      detail: "Agent is working",
      status: "running",
      model: "Claude Opus",
      startedAt: "2026-10-28T10:00:00Z",
    };
    const state = {
      tasks: [task],
      expanded: false,
      collapsing: false,
      revision: 0,
      branding: { name: "After Dark", icon: null },
      layout: { headerHeight: 40, notchWidth: 216, compactWidth: 456, width: 456, height: 500 },
    };
    update({}, state);
    assert.equal(document.querySelector(".summary-title")?.textContent, task.title);
    assert.match(document.querySelector("#metadata .elapsed")?.textContent ?? "", /^5m/);

    const target = { environmentId: "remote", threadId: "one", requestId: "question" };
    update(
      {},
      {
        ...state,
        expanded: true,
        activeRequest: target,
        tasks: [
          {
            ...task,
            status: "input",
            requests: [
              {
                kind: "input",
                requestId: target.requestId,
                questions: [
                  {
                    id: "monitor",
                    header: "Monitor",
                    question: "Which display?",
                    options: [],
                    multiSelect: false,
                  },
                ],
              },
            ],
          },
        ],
      },
    );
    assert.equal(document.querySelector(".app-name")?.textContent, "After Dark");
    assert.equal(document.querySelector(".request-model .model")?.textContent, task.model);
    assert.equal(document.querySelector(".request-question")?.textContent, "Which display?");
    const answer = document.querySelector(".request-custom");
    assert.ok(answer);
    answer.value = "Built-in display";
    answer.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".request-primary").click();
    assert.deepEqual(JSON.parse(JSON.stringify(ipcRenderer.send.mock.calls.at(-1))), [
      TASK_ACTIVITY_PANEL_CHANNEL,
      {
        action: "respond",
        response: { ...target, kind: "input", answers: { monitor: "Built-in display" } },
      },
    ]);
  } finally {
    window.dispatchEvent(new Event("unload"));
    vi.useRealTimers();
    await NodeFSP.rm(directory, { recursive: true, force: true });
  }
});
