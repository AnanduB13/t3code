import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import { isMissedCalendarRun, isSameSchedule, nextScheduledRunAt } from "./Schedule.ts";

const cronRunAfter = (expression: string, timeZone: string, from: string) => {
  const next = nextScheduledRunAt(
    { type: "cron", expression, timeZone },
    DateTime.makeUnsafe(from),
  );
  return next === null ? null : DateTime.formatIso(next);
};

describe("scheduled task schedule calculation", () => {
  it("skips to the next matching fixed-time weekday", () => {
    const next = nextScheduledRunAt(
      { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 2, 3, 4, 5] },
      DateTime.makeZonedUnsafe(
        {
          year: 2026,
          month: 7,
          day: 3,
          hour: 10,
          minute: 0,
          second: 0,
          millisecond: 0,
        },
        { timeZone: "America/Los_Angeles", adjustForTimeZone: true },
      ),
    );
    const parts = next ? DateTime.toParts(next) : null;
    expect(parts?.weekDay).toBe(1);
    expect(parts?.hour).toBe(9);
    expect(parts?.minute).toBe(0);
  });

  it("runs cron schedules in the task's own time zone across daylight saving changes", () => {
    // London moves to BST on 2026-03-29, so 09:00 local is 09:00Z before and 08:00Z after.
    expect(cronRunAfter("0 9 * * *", "Europe/London", "2026-03-27T12:00:00Z")).toBe(
      "2026-03-28T09:00:00.000Z",
    );
    expect(cronRunAfter("0 9 * * *", "Europe/London", "2026-03-28T12:00:00Z")).toBe(
      "2026-03-29T08:00:00.000Z",
    );
    expect(cronRunAfter("30 9 * * 1-5", "America/Los_Angeles", "2026-07-03T17:00:00Z")).toBe(
      "2026-07-06T16:30:00.000Z",
    );
    expect(cronRunAfter("0 */2 * * *", "UTC", "2026-07-01T09:00:00Z")).toBe(
      "2026-07-01T10:00:00.000Z",
    );
    expect(cronRunAfter("not a cron", "UTC", "2026-07-01T09:00:00Z")).toBeNull();
  });

  it("skips calendar runs the server slept through but lets intervals catch up", () => {
    const dueAt = DateTime.makeUnsafe("2026-07-01T09:00:00Z");
    const later = DateTime.makeUnsafe("2026-07-01T10:00:00Z");
    expect(
      isMissedCalendarRun({ type: "cron", expression: "0 9 * * *", timeZone: "UTC" }, dueAt, later),
    ).toBe(true);
    expect(isMissedCalendarRun({ type: "interval", everyMs: 60_000 }, dueAt, later)).toBe(false);
  });

  it("compares schedules structurally", () => {
    expect(
      isSameSchedule(
        { type: "once", runAt: "2026-11-01T03:00:00-05:00" },
        { type: "once", runAt: "2026-11-01T08:00:00.000Z" },
      ),
    ).toBe(true);
    expect(
      isSameSchedule({ type: "interval", everyMs: 60_000 }, { type: "interval", everyMs: 60_000 }),
    ).toBe(true);
    expect(
      isSameSchedule({ type: "interval", everyMs: 60_000 }, { type: "interval", everyMs: 30_000 }),
    ).toBe(false);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 2] },
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 2] },
      ),
    ).toBe(true);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [5, 1] },
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 5, 5] },
      ),
    ).toBe(true);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00" },
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [0, 1, 2, 3, 4, 5, 6] },
      ),
    ).toBe(true);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [] },
        { type: "fixed_time", timeOfDay: "09:00" },
      ),
    ).toBe(true);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 2] },
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 3] },
      ),
    ).toBe(false);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00" },
        { type: "fixed_time", timeOfDay: "09:30" },
      ),
    ).toBe(false);
    expect(
      isSameSchedule(
        { type: "interval", everyMs: 60_000 },
        { type: "fixed_time", timeOfDay: "09:00" },
      ),
    ).toBe(false);
    const cron = { type: "cron", expression: "0 9 * * 1-5", timeZone: "Europe/London" } as const;
    expect(isSameSchedule(cron, { ...cron, expression: " 0  9 * * 1-5 " })).toBe(true);
    expect(isSameSchedule(cron, { ...cron, timeZone: "Europe/Paris" })).toBe(false);
  });
});
