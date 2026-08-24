import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { selectThreadPreviewMiniPlayer, usePreviewMiniPlayerStore } from "~/previewMiniPlayerStore";

import {
  markPreviewTabAutomationOwned,
  prepareCompletedThreadPreviewCleanup,
  releaseAutomationOwnedPreviewTabs,
} from "./previewAutomationOwnership";

const threadRef = {
  environmentId: EnvironmentId.make("environment-1"),
  threadId: ThreadId.make("thread-1"),
};

describe("preview automation ownership", () => {
  beforeEach(() => {
    usePreviewMiniPlayerStore.setState({ byThreadKey: {} });
    releaseAutomationOwnedPreviewTabs(threadRef);
  });

  it("releases only tabs created by automation for the selected thread", () => {
    const otherThreadRef = { ...threadRef, threadId: ThreadId.make("thread-2") };
    markPreviewTabAutomationOwned(threadRef, "agent-tab-1");
    markPreviewTabAutomationOwned(threadRef, "agent-tab-2");
    markPreviewTabAutomationOwned(otherThreadRef, "other-agent-tab");

    expect(releaseAutomationOwnedPreviewTabs(threadRef)).toEqual(["agent-tab-1", "agent-tab-2"]);
    expect(releaseAutomationOwnedPreviewTabs(threadRef)).toEqual([]);
    expect(releaseAutomationOwnedPreviewTabs(otherThreadRef)).toEqual(["other-agent-tab"]);
  });

  it("hides a reused floating tab without treating it as automation-owned", () => {
    usePreviewMiniPlayerStore.getState().open(threadRef, "reused-user-tab");

    expect(prepareCompletedThreadPreviewCleanup(threadRef)).toEqual([]);
    expect(
      selectThreadPreviewMiniPlayer(usePreviewMiniPlayerStore.getState().byThreadKey, threadRef),
    ).toBeNull();
  });

  it("hides the floating preview and returns automation-created tabs for closing", () => {
    usePreviewMiniPlayerStore.getState().open(threadRef, "agent-tab");
    markPreviewTabAutomationOwned(threadRef, "agent-tab");

    expect(prepareCompletedThreadPreviewCleanup(threadRef)).toEqual(["agent-tab"]);
    expect(
      selectThreadPreviewMiniPlayer(usePreviewMiniPlayerStore.getState().byThreadKey, threadRef),
    ).toBeNull();
  });
});
