import { describe, expect, it } from "@effect/vitest";
import type { ComputerUseAppState } from "@t3tools/contracts";

import { isComputerUseAppState, pointerForAction } from "./computerUseMonitorState";

const observation: ComputerUseAppState = {
  app: "Settings",
  windowId: "window-1",
  observationId: "observation-1",
  text: "",
  elements: [
    {
      index: 0,
      depth: 0,
      label: "Appearance",
      interactive: true,
      x: 100,
      y: 40,
      width: 80,
      height: 20,
    },
  ],
  navigation: { focusedElementIndex: null, interactiveElementIndices: [0] },
  coordinateSpace: {
    kind: "window-screenshot",
    screenX: 0,
    screenY: 0,
    logicalWidth: 400,
    logicalHeight: 300,
    screenshotWidth: 800,
    screenshotHeight: 600,
    scaleX: 2,
    scaleY: 2,
  },
  screenshot: { mimeType: "image/png", data: "cG5n", width: 800, height: 600 },
};

describe("Computer Use monitor telemetry", () => {
  it("recognizes native application observations", () => {
    expect(isComputerUseAppState(observation)).toBe(true);
    expect(isComputerUseAppState({ screenshot: {} })).toBe(false);
  });

  it("places the virtual pointer at a semantic element center", () => {
    const pointer = pointerForAction(
      observation,
      "click",
      { observationId: "observation-1", elementIndex: 0 },
      4,
    );
    expect(pointer).toMatchObject({ xPercent: 17.5, operation: "click", sequence: 4 });
    expect(pointer?.yPercent).toBeCloseTo(8.3333);
  });

  it("uses a drag destination and ignores actions from stale observations", () => {
    expect(
      pointerForAction(
        observation,
        "drag",
        { observationId: "observation-1", toX: 400, toY: 300 },
        5,
      ),
    ).toMatchObject({ xPercent: 50, yPercent: 50, operation: "drag" });
    expect(
      pointerForAction(
        observation,
        "click",
        { observationId: "another-observation", x: 20, y: 20 },
        6,
      ),
    ).toBeUndefined();
  });
});
