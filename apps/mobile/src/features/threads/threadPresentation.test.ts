import { presentThreadShell } from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, RunId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { makeRawThreadShell } from "../../test-fixtures";
import { resolveThreadListV2Status } from "./threadListV2";

const completedThread = presentThreadShell(
  EnvironmentId.make("environment-1"),
  makeRawThreadShell({
    title: "Completed task",
    latestRunId: RunId.make("run-1"),
    status: "completed",
    latestRunCompletedAt: DateTime.makeUnsafe("2026-08-23T10:05:00.000Z"),
    updatedAt: DateTime.makeUnsafe("2026-08-23T10:05:00.000Z"),
  }),
);

describe("resolveThreadStatus", () => {
  it("does not keep a completed task labeled done without an unread marker", () => {
    expect(resolveThreadListV2Status(completedThread)).toBe("ready");
  });
});
