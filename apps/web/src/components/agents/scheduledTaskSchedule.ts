export type ScheduledTaskFrequency = "daily" | "weekly" | "monthly" | "custom";

export interface ScheduledTaskScheduleDraft {
  readonly frequency: ScheduledTaskFrequency;
  readonly time: string;
  readonly weekday: string;
  readonly monthday: string;
  readonly custom: string;
}

export const DEFAULT_SCHEDULE_DRAFT: ScheduledTaskScheduleDraft = {
  frequency: "daily",
  time: "09:00",
  weekday: "1",
  monthday: "1",
  custom: "",
};

export function buildCronSchedule(draft: ScheduledTaskScheduleDraft): string {
  if (draft.frequency === "custom") return draft.custom.trim();
  const match = draft.time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  if (draft.frequency === "weekly") return `${minute} ${hour} * * ${draft.weekday}`;
  if (draft.frequency === "monthly") return `${minute} ${hour} ${draft.monthday} * *`;
  return `${minute} ${hour} * * *`;
}

export function parseCronSchedule(schedule: string | null): ScheduledTaskScheduleDraft {
  if (!schedule) return DEFAULT_SCHEDULE_DRAFT;
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5)
    return { ...DEFAULT_SCHEDULE_DRAFT, frequency: "custom", custom: schedule };
  const [minuteValue, hourValue, monthday, month, weekday] = parts;
  const minute = Number(minuteValue);
  const hour = Number(hourValue);
  if (
    !Number.isInteger(minute) ||
    !Number.isInteger(hour) ||
    minute < 0 ||
    minute > 59 ||
    hour < 0 ||
    hour > 23 ||
    month !== "*"
  ) {
    return { ...DEFAULT_SCHEDULE_DRAFT, frequency: "custom", custom: schedule };
  }
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  if (monthday === "*" && weekday === "*") {
    return { ...DEFAULT_SCHEDULE_DRAFT, frequency: "daily", time };
  }
  if (monthday === "*" && /^[0-6]$/.test(weekday ?? "")) {
    return { ...DEFAULT_SCHEDULE_DRAFT, frequency: "weekly", time, weekday: weekday! };
  }
  if (weekday === "*" && /^(?:[1-9]|[12]\d|3[01])$/.test(monthday ?? "")) {
    return { ...DEFAULT_SCHEDULE_DRAFT, frequency: "monthly", time, monthday: monthday! };
  }
  return { ...DEFAULT_SCHEDULE_DRAFT, frequency: "custom", custom: schedule };
}
