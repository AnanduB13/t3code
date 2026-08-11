import { describe, expect, it } from "vite-plus/test";

import { resolveEnvironmentSyncLabel } from "./EnvironmentSummaryPopover";

describe("resolveEnvironmentSyncLabel", () => {
  it("describes synchronized branches", () => {
    expect(resolveEnvironmentSyncLabel({ hasUpstream: true, aheadCount: 0, behindCount: 0 })).toBe(
      "Up to date",
    );
  });

  it("describes branches that diverged", () => {
    expect(resolveEnvironmentSyncLabel({ hasUpstream: true, aheadCount: 3, behindCount: 2 })).toBe(
      "3 ahead, 2 behind",
    );
  });

  it("distinguishes repositories without an upstream", () => {
    expect(resolveEnvironmentSyncLabel({ hasUpstream: false, aheadCount: 0, behindCount: 0 })).toBe(
      "No upstream",
    );
  });
});
