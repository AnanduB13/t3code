import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import {
  ComputerUseActionResult,
  ComputerUseClickInput,
  ComputerUseMoveInput,
  ComputerUseScrollInput,
} from "./computerUse.ts";

const observedWindow = { windowId: "window-1", observationId: "observation-1" };

describe("Computer Use action inputs", () => {
  it("keeps observations opt-in and accepts completed actions whose capture failed", () => {
    const decode = Schema.decodeUnknownSync(ComputerUseClickInput);
    expect(decode({ ...observedWindow, x: 10, y: 20 }).observeAfter).toBeUndefined();
    expect(decode({ ...observedWindow, x: 10, y: 20, observeAfter: true }).observeAfter).toBe(true);
    const decodeResult = Schema.decodeUnknownSync(ComputerUseActionResult);
    expect(decodeResult(null)).toBeNull();
    expect(decodeResult({ actionCompleted: true, observationError: "Window closed" })).toEqual({
      actionCompleted: true,
      observationError: "Window closed",
    });
  });
  it("requires exactly one semantic or coordinate pointer target", () => {
    const decodeClick = Schema.decodeUnknownSync(ComputerUseClickInput);
    expect(() => decodeClick(observedWindow)).toThrow();
    expect(() => decodeClick({ ...observedWindow, elementIndex: 1, x: 10, y: 20 })).toThrow();
    expect(decodeClick({ ...observedWindow, elementIndex: 1 }).elementIndex).toBe(1);
    expect(decodeClick({ ...observedWindow, x: 10, y: 20 }).x).toBe(10);

    const decodeMove = Schema.decodeUnknownSync(ComputerUseMoveInput);
    expect(() => decodeMove({ ...observedWindow, x: 10 })).toThrow();
  });

  it("requires paired optional coordinates and at least one scroll delta", () => {
    const decode = Schema.decodeUnknownSync(ComputerUseScrollInput);
    expect(() => decode(observedWindow)).toThrow();
    expect(() => decode({ ...observedWindow, x: 10, deltaY: 20 })).toThrow();
    expect(decode({ ...observedWindow, deltaY: 20 }).deltaY).toBe(20);
  });
});
