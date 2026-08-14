import { describe, expect, it } from "@effect/vitest";

import { buildCronSchedule, parseCronSchedule } from "./scheduledTaskSchedule";

describe("scheduled task schedules", () => {
  it("builds daily, weekly, and monthly cron expressions", () => {
    expect(
      buildCronSchedule({
        frequency: "daily",
        time: "09:05",
        weekday: "1",
        monthday: "1",
        custom: "",
      }),
    ).toBe("5 9 * * *");
    expect(
      buildCronSchedule({
        frequency: "weekly",
        time: "14:30",
        weekday: "5",
        monthday: "1",
        custom: "",
      }),
    ).toBe("30 14 * * 5");
    expect(
      buildCronSchedule({
        frequency: "monthly",
        time: "00:00",
        weekday: "1",
        monthday: "15",
        custom: "",
      }),
    ).toBe("0 0 15 * *");
  });

  it("round trips supported expressions and preserves custom schedules", () => {
    expect(parseCronSchedule("30 9 * * 2")).toMatchObject({
      frequency: "weekly",
      time: "09:30",
      weekday: "2",
    });
    expect(parseCronSchedule("every 2h")).toMatchObject({
      frequency: "custom",
      custom: "every 2h",
    });
  });
});
