import { describe, expect, it } from "vite-plus/test";

import {
  resolveEnvironmentHostPresentation,
  resolveEnvironmentSyncLabel,
} from "./EnvironmentSummaryPopover";

describe("resolveEnvironmentSyncLabel", () => {
  it("describes synchronized branches", () => {
    expect(resolveEnvironmentSyncLabel({ hasUpstream: true, aheadCount: 0, behindCount: 0 })).toBe(
      "Up to date",
    );
  });

  it("describes branches that diverged", () => {
    expect(resolveEnvironmentSyncLabel({ hasUpstream: true, aheadCount: 3, behindCount: 2 })).toBe(
      "3 ahead, 2 behind",
    );
  });

  it("distinguishes repositories without an upstream", () => {
    expect(resolveEnvironmentSyncLabel({ hasUpstream: false, aheadCount: 0, behindCount: 0 })).toBe(
      "No upstream",
    );
  });
});

describe("resolveEnvironmentHostPresentation", () => {
  it("shows the reachable network host while retaining local process context", () => {
    expect(
      resolveEnvironmentHostPresentation(
        {
          host: "localhost",
          port: 5173,
          url: "http://localhost:5173",
          processName: "vite",
          pid: 123,
          terminal: null,
        },
        "http://k11.taild2a048.ts.net:5173/",
      ),
    ).toEqual({
      label: "k11.taild2a048.ts.net:5173",
      detail: "vite · local port 5173",
    });
  });

  it("falls back to the scanner host for an invalid resolved URL", () => {
    expect(
      resolveEnvironmentHostPresentation(
        {
          host: "localhost",
          port: 3000,
          url: "http://localhost:3000",
          processName: null,
          pid: null,
          terminal: null,
        },
        "not a url",
      ),
    ).toEqual({ label: "localhost:3000", detail: "Local port 3000" });
  });
});
