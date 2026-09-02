import { describe, expect, it } from "@effect/vitest";

import {
  absoluteBoundsToScreenshot,
  boundsMatch,
  fitScreenshotSize,
  selectWindowCaptureSource,
  selectUniqueWindowByTitle,
  screenshotPointToScreen,
} from "./computerUseGeometry.ts";

describe("Computer Use window coordinate mapping", () => {
  const retinaWindow = {
    x: 120,
    y: 80,
    width: 800,
    height: 600,
    screenshotWidth: 1600,
    screenshotHeight: 1200,
  };

  it("maps Retina screenshot pixels to logical desktop coordinates", () => {
    expect(screenshotPointToScreen(retinaWindow, { x: 800, y: 600 })).toEqual({
      x: 520,
      y: 380,
    });
  });

  it("keeps mapped edge pixels inside the observed logical window", () => {
    expect(
      screenshotPointToScreen(
        { x: 0, y: 0, width: 800, height: 600, screenshotWidth: 1600, screenshotHeight: 1200 },
        { x: 1599, y: 1199 },
      ),
    ).toEqual({ x: 799, y: 599 });
  });

  it("bounds large screenshots while preserving their aspect ratio", () => {
    expect(fitScreenshotSize(3_840, 2_160)).toEqual({ width: 1_600, height: 900 });
    expect(fitScreenshotSize(1_200, 800)).toEqual({ width: 1_200, height: 800 });
  });

  it("maps accessibility bounds into the same screenshot coordinate space", () => {
    expect(
      absoluteBoundsToScreenshot(retinaWindow, {
        x: 220,
        y: 130,
        width: 100,
        height: 40,
      }),
    ).toEqual({ x: 200, y: 100, width: 200, height: 80 });
  });

  it("rejects points outside the observed image", () => {
    expect(() => screenshotPointToScreen(retinaWindow, { x: 1600, y: 10 })).toThrow(
      "outside 1600x1200",
    );
    expect(() => screenshotPointToScreen(retinaWindow, { x: -1, y: 10 })).toThrow(
      "outside 1600x1200",
    );
  });

  it("detects stale window geometry while tolerating tiny OS rounding changes", () => {
    expect(
      boundsMatch(
        { x: 10, y: 20, width: 800, height: 600 },
        { x: 11, y: 19, width: 801, height: 599 },
      ),
    ).toBe(true);
    expect(
      boundsMatch(
        { x: 10, y: 20, width: 800, height: 600 },
        { x: 40, y: 20, width: 800, height: 600 },
      ),
    ).toBe(false);
  });

  it("prefers one exact title and refuses ambiguous partial window names", () => {
    const windows = [
      { id: "settings", title: "Settings" },
      { id: "docs", title: "Settings — Documentation" },
      { id: "general", title: "General — Settings" },
    ];
    expect(selectUniqueWindowByTitle(windows, "Settings").id).toBe("settings");
    expect(() => selectUniqueWindowByTitle(windows, "Set")).toThrow("ambiguous");
    expect(() => selectUniqueWindowByTitle(windows, "Missing")).toThrow(
      "No visible application window",
    );
  });

  it("selects an unobscured native window capture by handle before title", () => {
    const sources = [
      { id: "window:41:0", name: "Editor" },
      { id: "window:42:0", name: "Editor" },
    ];
    expect(
      selectWindowCaptureSource(sources, { nativeKey: "handle:42", title: "Editor" })?.id,
    ).toBe("window:42:0");
    expect(
      selectWindowCaptureSource(sources, { nativeKey: "fallback:Editor", title: "Editor" }),
    ).toBeUndefined();
    expect(
      selectWindowCaptureSource([{ id: "window:9:0", name: "Settings" }], {
        nativeKey: "fallback:Settings",
        title: "Settings",
      })?.id,
    ).toBe("window:9:0");
  });
});
