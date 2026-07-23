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
  if (!element.region) return null;
  return absoluteBoundsToScreenshot(coordinateSpace, {
    x: element.region.left,
    y: element.region.top,
    width: element.region.width,
    height: element.region.height,
  });
};

export const flattenAccessibilityTree = (
  root: NativeAccessibilityElement,
  coordinateSpace: ComputerUseCoordinateSpace,
  maximumElements = 1_000,
): ComputerUseElement[] => {
  const result: ComputerUseElement[] = [];
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
      ...(element.role || element.type ? { role: element.role ?? element.type } : {}),
      ...(element.subRole ? { subRole: element.subRole } : {}),
      ...(element.title ? { label: element.title } : {}),
      ...(element.value ? { value: element.value } : {}),
      ...(element.selectedText ? { selectedText: element.selectedText } : {}),
      ...(element.isFocused === undefined ? {} : { focused: element.isFocused }),
      ...(element.isEnabled === undefined ? {} : { enabled: element.isEnabled }),
      interactive: isLikelyInteractive(element),
      ...(bounds ?? {}),
    });
    for (const child of element.children ?? []) visit(child, depth + 1, index);
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
      return `${"  ".repeat(element.depth)}[${element.index}] ${element.role ?? "element"}${quoted(element.subRole, "subrole")}${quoted(element.label, "label")}${quoted(element.value, "value")}${quoted(element.selectedText, "selected")}${state ? ` state=(${state})` : ""}${rectangle}`;
    })
    .join("\n");

export const summarizeNavigation = (elements: readonly ComputerUseElement[]) => ({
  focusedElementIndex: elements.find((element) => element.focused)?.index ?? null,
  interactiveElementIndices: elements
    .filter((element) => element.interactive)
    .map((element) => element.index),
});
