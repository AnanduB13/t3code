import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  isChatWorkspacePlaceholder,
  normalizeChatWorkspaceLayout,
  resizeAdjacentChatWorkspaceWeights,
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
      columnWeights: [1],
      rowWeights: [1],
    });
  });

  it("grows by copying the focused pane so navigation can replace it", () => {
    expect(
      resizeChatWorkspaceLayout(
        {
          paneThreadKeys: ["env:a", "env:b"],
          activePaneIndex: 1,
          columns: 2,
          columnWeights: [1, 1],
          rowWeights: [1],
        },
        4,
        2,
      ),
    ).toEqual({
      paneThreadKeys: ["env:a", "env:b", "env:b", "env:b"],
      activePaneIndex: 1,
      columns: 2,
      columnWeights: [1, 1],
      rowWeights: [1, 1],
    });
  });

  it("caps layouts at sixteen panes and keeps the active index valid", () => {
    const resized = resizeChatWorkspaceLayout(
      {
        paneThreadKeys: ["env:a", "env:b"],
        activePaneIndex: 1,
        columns: 2,
        columnWeights: [1, 1],
        rowWeights: [1],
      },
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
          columnWeights: [0.75, 1.25],
          rowWeights: [0.6, 1.4],
        },
        2,
        1,
      ),
    ).toEqual({
      paneThreadKeys: ["env:a", "env:d"],
      activePaneIndex: 1,
      columns: 1,
      columnWeights: [0.75],
      rowWeights: [0.6, 1.4],
    });
  });

  it("mounts only the focused copy of a duplicated thread", () => {
    const layout = {
      paneThreadKeys: ["env:a", "env:a", "env:b", "env:a"],
      activePaneIndex: 3,
      columns: 2,
      columnWeights: [1, 1],
      rowWeights: [1, 1],
    };
    expect(
      layout.paneThreadKeys.map((_, index) => isChatWorkspacePlaceholder(layout, index)),
    ).toEqual([true, true, false, false]);
  });

  it("preserves valid split sizes and replaces invalid persisted values", () => {
    expect(
      normalizeChatWorkspaceLayout(
        {
          paneThreadKeys: ["env:a", "env:b", "env:c", "env:d"],
          columns: 2,
          columnWeights: [0.7, 1.3, 99],
          rowWeights: [Number.NaN, -1],
        },
        fallback,
      ),
    ).toMatchObject({
      columnWeights: [0.7, 1.3],
      rowWeights: [1, 1],
    });
  });

  it("resizes adjacent panes without changing the total or crossing the minimum", () => {
    expect(resizeAdjacentChatWorkspaceWeights([1, 1], 0, 0.5, 0.2)).toEqual([1.5, 0.5]);
    const clamped = resizeAdjacentChatWorkspaceWeights([1, 1], 0, 5, 0.2);
    expect(clamped[0]).toBeCloseTo(1.8);
    expect(clamped[1]).toBeCloseTo(0.2);
    expect(resizeAdjacentChatWorkspaceWeights([0.5, 1.5, 1], 1, -5, 0.25)).toEqual([
      0.5, 0.25, 2.25,
    ]);
  });
});
