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
  it("shows the scanner-reported host without inventing a network route", () => {
    expect(
      resolveEnvironmentHostPresentation({
        host: "localhost",
        port: 5173,
        url: "http://localhost:5173",
        processName: "vite",
        pid: 123,
        terminal: null,
      }),
    ).toEqual({
      label: "localhost:5173",
      detail: "vite · local port 5173",
    });
  });

  it("describes hosts whose process name is unavailable", () => {
    expect(
      resolveEnvironmentHostPresentation({
        host: "localhost",
        port: 3000,
        url: "http://localhost:3000",
        processName: null,
        pid: null,
        terminal: null,
      }),
    ).toEqual({ label: "localhost:3000", detail: "Local port 3000" });
  });
});
