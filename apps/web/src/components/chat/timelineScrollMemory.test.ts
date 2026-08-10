import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  clearRememberedTimelineScrollOffsetsForTests,
  forgetTimelineScrollOffset,
  getRememberedTimelineScrollOffset,
  rememberTimelineScrollOffset,
} from "./timelineScrollMemory";

describe("timelineScrollMemory", () => {
  beforeEach(() => clearRememberedTimelineScrollOffsetsForTests());

  it("remembers an independent reading position for each thread", () => {
    rememberTimelineScrollOffset("environment-1:thread-1", 420);
    rememberTimelineScrollOffset("environment-1:thread-2", 960);

    expect(getRememberedTimelineScrollOffset("environment-1:thread-1")).toBe(420);
    expect(getRememberedTimelineScrollOffset("environment-1:thread-2")).toBe(960);
  });

  it("forgets a position when the reader returns to the live edge", () => {
    rememberTimelineScrollOffset("environment-1:thread-1", 420);
    forgetTimelineScrollOffset("environment-1:thread-1");

    expect(getRememberedTimelineScrollOffset("environment-1:thread-1")).toBeUndefined();
  });

  it("ignores invalid offsets", () => {
    rememberTimelineScrollOffset("environment-1:thread-1", Number.NaN);
    rememberTimelineScrollOffset("environment-1:thread-2", -1);

    expect(getRememberedTimelineScrollOffset("environment-1:thread-1")).toBeUndefined();
    expect(getRememberedTimelineScrollOffset("environment-1:thread-2")).toBeUndefined();
  });
});
