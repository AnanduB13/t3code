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

it("starts the packaged notch preload with only Electron available in the sandbox", async () => {
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
    const ipcRenderer = { on: vi.fn(), send: vi.fn() };
    NodeVM.runInNewContext(
      source,
      {
        window,
        document,
        matchMedia: () => ({ matches: false }),
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
  } finally {
    window.dispatchEvent(new Event("unload"));
    await NodeFSP.rm(directory, { recursive: true, force: true });
  }
});
