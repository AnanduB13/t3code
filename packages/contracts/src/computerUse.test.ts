import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import {
  ComputerUseClickInput,
  ComputerUseMoveInput,
  ComputerUseScrollInput,
} from "./computerUse.ts";

const observedWindow = { windowId: "window-1", observationId: "observation-1" };

describe("Computer Use action inputs", () => {
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
