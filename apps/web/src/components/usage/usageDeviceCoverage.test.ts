import type { UsageSource } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { describeUsageSources } from "./usageDeviceCoverage";

function source(input: {
  readonly provider: "codex" | "claude";
  readonly status: UsageSource["status"];
  readonly sessions?: number;
}): UsageSource {
  return {
    fingerprint: {
      hostId: "device",
      provider: input.provider,
      resolvedHomePath: `/usage/${input.provider}`,
      volumeId: "1:2",
    },
    status: input.status,
    scannedFiles: 0,
    skippedFiles: 0,
    malformedRecords: 0,
    distinctSessions: input.sessions ?? 0,
    message: null,
  };
}

describe("describeUsageSources", () => {
  it("makes terminal coverage explicit for each provider", () => {
    expect(
      describeUsageSources([
        source({ provider: "codex", status: "ok", sessions: 128 }),
        source({ provider: "claude", status: "missing" }),
      ]),
    ).toBe("Codex 128 sessions · Claude Code not found");
  });

  it("labels partial scans", () => {
    expect(
      describeUsageSources([source({ provider: "claude", status: "partial", sessions: 1 })]),
    ).toBe("Claude Code 1 session (partial)");
  });
});
