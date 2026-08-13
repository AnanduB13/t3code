import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  isChatWorkspacePlaceholder,
  normalizeChatWorkspaceLayout,
  resizeChatWorkspaceLayout,
} from "./chatWorkspaceLayout";

const fallback = {
  environmentId: EnvironmentId.make("environment-1"),
  threadId: ThreadId.make("thread-1"),
};

describe("chat workspace layout", () => {
  it("starts with the routed thread", () => {
    expect(normalizeChatWorkspaceLayout({}, fallback)).toEqual({
      paneThreadKeys: ["environment-1:thread-1"],
      activePaneIndex: 0,
      columns: 1,
    });
  });

  it("grows by copying the focused pane so navigation can replace it", () => {
    expect(
      resizeChatWorkspaceLayout(
        { paneThreadKeys: ["env:a", "env:b"], activePaneIndex: 1, columns: 2 },
        4,
        2,
      ),
    ).toEqual({
      paneThreadKeys: ["env:a", "env:b", "env:b", "env:b"],
      activePaneIndex: 1,
      columns: 2,
    });
  });

  it("caps layouts at sixteen panes and keeps the active index valid", () => {
    const resized = resizeChatWorkspaceLayout(
      { paneThreadKeys: ["env:a", "env:b"], activePaneIndex: 1, columns: 2 },
      99,
      99,
    );
    expect(resized.paneThreadKeys).toHaveLength(16);
    expect(resized.columns).toBe(16);
    expect(resized.activePaneIndex).toBe(1);
  });

  it("keeps the focused chat when shrinking away its old slot", () => {
    expect(
      resizeChatWorkspaceLayout(
        {
          paneThreadKeys: ["env:a", "env:b", "env:c", "env:d"],
          activePaneIndex: 3,
          columns: 2,
        },
        2,
        1,
      ),
    ).toEqual({
      paneThreadKeys: ["env:a", "env:d"],
      activePaneIndex: 1,
      columns: 1,
    });
  });

  it("mounts only the focused copy of a duplicated thread", () => {
    const layout = {
      paneThreadKeys: ["env:a", "env:a", "env:b", "env:a"],
      activePaneIndex: 3,
      columns: 2,
    };
    expect(
      layout.paneThreadKeys.map((_, index) => isChatWorkspacePlaceholder(layout, index)),
    ).toEqual([true, true, false, false]);
  });
});
