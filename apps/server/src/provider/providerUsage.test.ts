import { describe, expect, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";

import { claudeUsageSnapshot, codexUsageSnapshot } from "./providerUsage.ts";

describe("provider usage normalization", () => {
  it("normalizes Codex session and weekly windows as remaining percentages", () => {
    const snapshot = codexUsageSnapshot({
      instanceId: ProviderInstanceId.make("codex"),
      displayName: "Codex",
      updatedAt: "2026-07-21T12:00:00.000Z",
      response: {
        rateLimits: {
          planType: "plus",
          primary: { usedPercent: 27, resetsAt: 1_774_305_600, windowDurationMins: 300 },
          secondary: { usedPercent: 64, resetsAt: 1_774_737_600, windowDurationMins: 10_080 },
        },
      },
    });

    expect(snapshot.status).toBe("available");
    expect(snapshot.plan).toBe("plus");
    expect(snapshot.windows.map((window) => [window.label, window.remainingPercent])).toEqual([
      ["Session", 73],
      ["Weekly", 36],
    ]);
    expect(snapshot.windows[0]?.resetsAt).toBe("2026-03-23T22:40:00.000Z");
  });

  it("recognizes a weekly-only Codex limit reported in the primary slot", () => {
    const snapshot = codexUsageSnapshot({
      instanceId: ProviderInstanceId.make("codex"),
      displayName: "Codex",
      updatedAt: "2026-07-21T12:00:00.000Z",
      response: {
        rateLimits: {
          limitId: "codex",
          planType: "pro",
          primary: { usedPercent: 3, resetsAt: 1_784_951_492, windowDurationMins: 10_080 },
          secondary: null,
        },
        rateLimitsByLimitId: {
          codex: {
            limitName: null,
            primary: { usedPercent: 3, resetsAt: 1_784_951_492, windowDurationMins: 10_080 },
          },
        },
      },
    });

    expect(snapshot.windows).toHaveLength(1);
    expect(snapshot.windows[0]).toMatchObject({
      id: "default:primary",
      label: "Weekly",
      remainingPercent: 97,
    });
  });

  it("normalizes Claude OAuth windows and preserves model-specific limits", () => {
    const snapshot = claudeUsageSnapshot({
      instanceId: ProviderInstanceId.make("claudeAgent"),
      displayName: "Claude",
      updatedAt: "2026-07-21T12:00:00.000Z",
      response: {
        five_hour: { utilization: 12.5, resets_at: "2026-07-21T15:00:00Z" },
        seven_day: { utilization: 80, resets_at: "2026-07-25T00:00:00Z" },
        seven_day_sonnet: { utilization: 34, resets_at: null },
        unrelated: { utilization: 99 },
      },
    });

    expect(snapshot.windows.map((window) => [window.id, window.remainingPercent])).toEqual([
      ["five_hour", 87.5],
      ["seven_day", 20],
      ["seven_day_sonnet", 66],
    ]);
  });

  it("bounds malformed provider percentages", () => {
    const snapshot = claudeUsageSnapshot({
      instanceId: ProviderInstanceId.make("claudeAgent"),
      displayName: "Claude",
      updatedAt: "2026-07-21T12:00:00.000Z",
      response: { five_hour: { utilization: 140 } },
    });
    expect(snapshot.windows[0]?.remainingPercent).toBe(0);
  });
});
