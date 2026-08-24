// @effect-diagnostics globalDate:off -- fixtures exercise the Date-based browser formatting boundary.
import { describe, expect, it } from "vite-plus/test";

import { enumerateDays, makeAllTimeWindow, makeWindow } from "./usageFormat.ts";

describe("usage windows", () => {
  it("builds an inclusive fixed-day window", () => {
    const window = makeWindow(7, new Date("2026-08-24T12:00:00.000Z"));
    expect(enumerateDays(window.sinceDay, window.untilDay)).toHaveLength(7);
  });

  it("uses the full transcript era for all-time usage", () => {
    expect(makeAllTimeWindow(new Date("2026-08-24T12:00:00.000Z"))).toMatchObject({
      sinceDay: "1970-01-01",
    });
  });

  it("enumerates both boundaries", () => {
    expect(enumerateDays("2026-08-22", "2026-08-24")).toEqual([
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
    ]);
  });
});
