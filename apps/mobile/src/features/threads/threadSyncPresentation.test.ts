import { describe, expect, it } from "vite-plus/test";

import { threadSyncPhase } from "./threadSyncPresentation";

describe("threadSyncPhase", () => {
  it("does not report cached messages as actively syncing", () => {
    expect(threadSyncPhase({ status: "cached", contentKind: "ready" })).toBeNull();
  });

  it("reports an active reconciliation when cached content is visible", () => {
    expect(threadSyncPhase({ status: "synchronizing", contentKind: "ready" })).toBe("syncing");
  });

  it("reports loading while the active synchronization has no content", () => {
    expect(threadSyncPhase({ status: "synchronizing", contentKind: "loading" })).toBe("loading");
  });

  it("clears the indicator once the thread becomes live", () => {
    expect(threadSyncPhase({ status: "live", contentKind: "ready" })).toBeNull();
  });
});
