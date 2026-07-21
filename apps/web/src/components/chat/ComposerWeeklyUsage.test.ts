import { describe, expect, it } from "vite-plus/test";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderUsageSnapshot,
} from "@t3tools/contracts";

import { formatWeeklyUsageReset, selectWeeklyUsageWindow } from "./ComposerWeeklyUsage";

function snapshot(windows: ProviderUsageSnapshot["windows"]): ProviderUsageSnapshot {
  return {
    instanceId: ProviderInstanceId.make("codex"),
    provider: ProviderDriverKind.make("codex"),
    displayName: "Codex",
    status: "available",
    windows,
    updatedAt: "2026-07-21T12:00:00.000Z" as never,
  };
}

describe("composer weekly usage", () => {
  it("prefers the account-wide Codex weekly window over model-specific windows", () => {
    const weekly = selectWeeklyUsageWindow(
      snapshot([
        { id: "spark:secondary", label: "Spark · weekly", usedPercent: 20, remainingPercent: 80 },
        { id: "default:secondary", label: "Weekly", usedPercent: 40, remainingPercent: 60 },
      ]),
    );
    expect(weekly?.remainingPercent).toBe(60);
  });

  it("selects Claude's seven-day window", () => {
    const weekly = selectWeeklyUsageWindow(
      snapshot([{ id: "seven_day", label: "Weekly", usedPercent: 75, remainingPercent: 25 }]),
    );
    expect(weekly?.id).toBe("seven_day");
  });

  it("selects a weekly-only Codex window reported as primary", () => {
    const weekly = selectWeeklyUsageWindow(
      snapshot([
        {
          id: "default:primary",
          label: "Primary limit",
          usedPercent: 3,
          remainingPercent: 97,
          windowDurationMins: 10_080,
        },
      ]),
    );
    expect(weekly?.remainingPercent).toBe(97);
  });

  it("does not show unavailable usage", () => {
    expect(selectWeeklyUsageWindow({ ...snapshot([]), status: "unavailable" })).toBeNull();
  });

  it("formats reset countdowns compactly", () => {
    const now = new Date("2026-07-21T12:00:00.000Z");
    expect(formatWeeklyUsageReset("2026-07-21T17:00:00.000Z", now)).toBe("resets in 5h");
    expect(formatWeeklyUsageReset("2026-07-23T14:00:00.000Z", now)).toBe("resets in 2d 2h");
  });
});
