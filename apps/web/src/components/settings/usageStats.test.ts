import { ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { deriveUsageStats } from "./usageStats";

function thread(createdAt: string, provider = "codex") {
  return {
    createdAt,
    modelSelection: { instanceId: ProviderInstanceId.make(provider) },
  } as never;
}

describe("deriveUsageStats", () => {
  it("calculates activity, streaks, and provider share", () => {
    const result = deriveUsageStats(
      [
        thread("2026-07-18T10:00:00.000Z"),
        thread("2026-07-19T10:00:00.000Z"),
        thread("2026-07-20T10:00:00.000Z", "claude-code"),
        thread("2026-07-20T12:00:00.000Z", "claude-code"),
        thread("2026-07-21T10:00:00.000Z"),
      ],
      new Date("2026-07-21T18:00:00.000Z"),
    );

    expect(result.totalChats).toBe(5);
    expect(result.activeDays).toBe(4);
    expect(result.currentStreak).toBe(4);
    expect(result.longestStreak).toBe(4);
    expect(result.busiestDay).toEqual({ date: "2026-07-20", count: 2 });
    expect(result.providers).toEqual([
      { provider: "Codex", count: 3, percentage: 60 },
      { provider: "Claude Code", count: 2, percentage: 40 },
    ]);
  });

  it("allows a current streak to continue from yesterday", () => {
    const result = deriveUsageStats(
      [thread("2026-07-18T10:00:00.000Z"), thread("2026-07-19T10:00:00.000Z")],
      new Date("2026-07-20T10:00:00.000Z"),
    );
    expect(result.currentStreak).toBe(2);
  });
});
