import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  markPreviewTabAutomationOwned,
  releaseAutomationOwnedPreviewTabs,
} from "./previewAutomationOwnership";

const threadRef = {
  environmentId: EnvironmentId.make("environment-1"),
  threadId: ThreadId.make("thread-1"),
};

describe("preview automation ownership", () => {
  it("releases only tabs created by automation for the selected thread", () => {
    const otherThreadRef = { ...threadRef, threadId: ThreadId.make("thread-2") };
    markPreviewTabAutomationOwned(threadRef, "agent-tab-1");
    markPreviewTabAutomationOwned(threadRef, "agent-tab-2");
    markPreviewTabAutomationOwned(otherThreadRef, "other-agent-tab");

    expect(releaseAutomationOwnedPreviewTabs(threadRef)).toEqual(["agent-tab-1", "agent-tab-2"]);
    expect(releaseAutomationOwnedPreviewTabs(threadRef)).toEqual([]);
    expect(releaseAutomationOwnedPreviewTabs(otherThreadRef)).toEqual(["other-agent-tab"]);
  });
});
