import { describe, expect, it } from "@effect/vitest";

import {
  describeAccessibilityTree,
  flattenAccessibilityTree,
  summarizeNavigation,
} from "./computerUseAccessibility.ts";

const coordinateSpace = {
  x: 100,
  y: 50,
  width: 500,
  height: 400,
  screenshotWidth: 1_000,
  screenshotHeight: 800,
};

describe("Computer Use accessibility navigation", () => {
  const elements = flattenAccessibilityTree(
    {
      role: "AXWindow",
      title: "Settings",
      region: { left: 100, top: 50, width: 500, height: 400 },
      children: [
        {
          role: "AXGroup",
          title: "Sidebar",
          children: [
            {
              role: "AXButton",
              title: "Appearance",
              isEnabled: true,
              region: { left: 120, top: 100, width: 100, height: 20 },
            },
          ],
        },
        {
          role: "AXTextField",
          title: "Search",
          value: "dark mode",
          selectedText: "dark",
          isFocused: true,
          isEnabled: true,
          region: { left: 300, top: 70, width: 200, height: 30 },
        },
        {
          role: "AXButton",
          title: "Unavailable",
          isEnabled: false,
          region: { left: 300, top: 350, width: 100, height: 30 },
        },
      ],
    },
    coordinateSpace,
  );

  it("preserves hierarchy, focus, control state, and screenshot-relative bounds", () => {
    expect(elements[2]).toMatchObject({
      index: 2,
      parentIndex: 1,
      depth: 2,
      role: "AXButton",
      label: "Appearance",
      enabled: true,
      interactive: true,
      x: 40,
      y: 100,
      width: 200,
      height: 40,
    });
    expect(elements[3]).toMatchObject({
      focused: true,
      selectedText: "dark",
      interactive: true,
    });
    expect(elements[4]).toMatchObject({ enabled: false, interactive: false });
  });

  it("produces an indented model-readable navigation tree", () => {
    const text = describeAccessibilityTree(elements);
    expect(text).toContain('    [2] AXButton label="Appearance" state=(interactive)');
    expect(text).toContain('  [3] AXTextField label="Search" value="dark mode"');
    expect(text).toContain('selected="dark" state=(interactive,focused)');
    expect(text).toContain("state=(disabled)");
  });

  it("summarizes the focused and actionable controls", () => {
    expect(summarizeNavigation(elements)).toEqual({
      focusedElementIndex: 3,
      interactiveElementIndices: [2, 3],
    });
  });
});
