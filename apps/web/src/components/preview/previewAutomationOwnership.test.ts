import { EnvironmentId, type PreviewSessionSnapshot, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { selectThreadPreviewMiniPlayer, usePreviewMiniPlayerStore } from "~/previewMiniPlayerStore";

import { prepareCompletedThreadPreviewCleanup } from "./previewAutomationOwnership";

const threadRef = {
  environmentId: EnvironmentId.make("environment-1"),
  threadId: ThreadId.make("thread-1"),
};

function session(
  tabId: string,
  extra: Pick<PreviewSessionSnapshot, "runtime" | "automationOwner">,
): PreviewSessionSnapshot {
  return {
    threadId: threadRef.threadId,
    tabId,
    navStatus: { _tag: "Idle" },
    canGoBack: false,
    canGoForward: false,
    updatedAt: "2026-10-18T00:00:00.000Z",
    ...extra,
  };
}

describe("prepareCompletedThreadPreviewCleanup", () => {
  beforeEach(() => {
    usePreviewMiniPlayerStore.setState({ byThreadKey: {} });
  });

  it("returns only server tabs an agent opened", () => {
    const sessions = {
      agent: session("agent", { runtime: "server", automationOwner: "agent-1" }),
      user: session("user", { runtime: "server" }),
      local: session("local", { automationOwner: "agent-1" }),
    };
    expect(prepareCompletedThreadPreviewCleanup(threadRef, sessions)).toEqual(["agent"]);
  });

  it("hides a reused floating tab without treating it as agent-owned", () => {
    usePreviewMiniPlayerStore
      .getState()
      .open(threadRef, { kind: "browser", tabId: "reused-user-tab" });

    expect(
      prepareCompletedThreadPreviewCleanup(threadRef, {
        "reused-user-tab": session("reused-user-tab", { runtime: "server" }),
      }),
    ).toEqual([]);
    expect(
      selectThreadPreviewMiniPlayer(usePreviewMiniPlayerStore.getState().byThreadKey, threadRef),
    ).toBeNull();
  });
});
