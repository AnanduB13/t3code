import type { ComputerUseElement } from "@t3tools/contracts";

import {
  absoluteBoundsToScreenshot,
  type ComputerUseBounds,
  type ComputerUseCoordinateSpace,
} from "./computerUseGeometry.ts";

export interface NativeAccessibilityElement {
  readonly type?: string | undefined;
  readonly region?:
    | {
        readonly left: number;
        readonly top: number;
        readonly width: number;
        readonly height: number;
      }
    | undefined;
  readonly title?: string | undefined;
  readonly value?: string | undefined;
  readonly isFocused?: boolean | undefined;
  readonly selectedText?: string | undefined;
  readonly isEnabled?: boolean | undefined;
  readonly role?: string | undefined;
  readonly subRole?: string | undefined;
  readonly children?: readonly NativeAccessibilityElement[] | undefined;
}

const INTERACTIVE_ROLE_PARTS = [
  "button",
  "checkbox",
  "combo",
  "disclosure",
  "link",
  "menuitem",
  "popup",
  "radio",
  "row",
  "searchfield",
  "slider",
  "switch",
  "tab",
  "textfield",
  "textbox",
] as const;

const isLikelyInteractive = (element: NativeAccessibilityElement): boolean => {
  if (element.isEnabled === false || !element.region) return false;
  const semanticRole = `${element.role ?? ""} ${element.subRole ?? ""} ${element.type ?? ""}`
    .replaceAll(/[^a-zA-Z]/g, "")
    .toLocaleLowerCase();
  return INTERACTIVE_ROLE_PARTS.some((role) => semanticRole.includes(role));
};

const relativeBounds = (
  element: NativeAccessibilityElement,
  coordinateSpace: ComputerUseCoordinateSpace,
): ComputerUseBounds | null => {
  if (!element.region || !Object.values(element.region).every(Number.isFinite)) return null;
  const bounds = absoluteBoundsToScreenshot(coordinateSpace, {
    x: element.region.left,
    y: element.region.top,
    width: element.region.width,
    height: element.region.height,
  });
  const x = Math.max(0, bounds.x);
  const y = Math.max(0, bounds.y);
  const right = Math.min(coordinateSpace.screenshotWidth, bounds.x + bounds.width);
  const bottom = Math.min(coordinateSpace.screenshotHeight, bounds.y + bounds.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
};

export const flattenAccessibilityTree = (
  root: NativeAccessibilityElement,
  coordinateSpace: ComputerUseCoordinateSpace,
  maximumElements = 1_000,
): ComputerUseElement[] => {
  const result: ComputerUseElement[] = [];
  let remainingText = 32_000;
  const boundedText = (value: string | undefined) => {
    if (!value) return undefined;
    const limit = Math.min(1_024, remainingText);
    remainingText -= Math.min(limit, value.length);
    return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`;
  };
  const visit = (
    element: NativeAccessibilityElement,
    depth: number,
    parentIndex?: number,
  ): void => {
    if (result.length >= maximumElements) return;
    const index = result.length;
    const bounds = relativeBounds(element, coordinateSpace);
    result.push({
      index,
      depth,
      ...(parentIndex === undefined ? {} : { parentIndex }),
      ...(element.role || element.type ? { role: boundedText(element.role ?? element.type) } : {}),
      ...(element.subRole ? { subRole: boundedText(element.subRole) } : {}),
      ...(element.title ? { label: boundedText(element.title) } : {}),
      ...(element.value ? { value: boundedText(element.value) } : {}),
      ...(element.selectedText ? { selectedText: boundedText(element.selectedText) } : {}),
      ...(element.isFocused === undefined ? {} : { focused: element.isFocused }),
      ...(element.isEnabled === undefined ? {} : { enabled: element.isEnabled }),
      interactive: bounds !== null && isLikelyInteractive(element),
      ...bounds,
    });
    for (const child of element.children ?? []) {
      if (result.length >= maximumElements) break;
      visit(child, depth + 1, index);
    }
  };
  visit(root, 0);
  return result;
};

const quoted = (value: string | undefined, prefix: string): string =>
  value ? ` ${prefix}=${JSON.stringify(value)}` : "";

export const describeAccessibilityTree = (elements: readonly ComputerUseElement[]): string =>
  elements
    .map((element) => {
      const state = [
        element.interactive ? "interactive" : null,
        element.focused ? "focused" : null,
        element.enabled === false ? "disabled" : null,
      ]
        .filter((value): value is string => value !== null)
        .join(",");
      const rectangle =
        element.x === undefined
          ? ""
          : ` rect=(${element.x},${element.y},${element.width},${element.height})`;
      return `${"  ".repeat(Math.min(element.depth, 12))}[${element.index}] ${element.role ?? "element"}${element.depth > 12 ? ` parent=${element.parentIndex}` : ""}${quoted(element.subRole, "subrole")}${quoted(element.label, "label")}${quoted(element.value, "value")}${quoted(element.selectedText, "selected")}${state ? ` state=(${state})` : ""}${rectangle}`;
    })
    .join("\n");

export const summarizeNavigation = (elements: readonly ComputerUseElement[]) => ({
  focusedElementIndex: elements.find((element) => element.focused)?.index ?? null,
  interactiveElementIndices: elements
    .filter((element) => element.interactive)
    .map((element) => element.index),
});
