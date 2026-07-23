import type {
  ComputerUseAppState,
  ComputerUseDevice,
  ComputerUseOperation,
} from "@t3tools/contracts";

export interface ComputerUsePointerState {
  readonly xPercent: number;
  readonly yPercent: number;
  readonly operation: ComputerUseOperation;
  readonly sequence: number;
}

export interface ComputerUseMonitorState {
  readonly deviceLabel: string;
  readonly sessionIsolation: ComputerUseDevice["sessionIsolation"];
  readonly phase: "capturing" | "acting" | "idle" | "error";
  readonly operation: ComputerUseOperation;
  readonly app?: string;
  readonly observation?: ComputerUseAppState;
  readonly pointer?: ComputerUsePointerState;
  readonly message?: string;
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

export const isComputerUseAppState = (value: unknown): value is ComputerUseAppState => {
  const state = record(value);
  const screenshot = record(state?.screenshot);
  return (
    typeof state?.app === "string" &&
    typeof state.windowId === "string" &&
    typeof state.observationId === "string" &&
    typeof screenshot?.data === "string" &&
    typeof screenshot.width === "number" &&
    typeof screenshot.height === "number"
  );
};

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const coordinateForAction = (
  observation: ComputerUseAppState,
  operation: ComputerUseOperation,
  rawInput: unknown,
): { x: number; y: number } | null => {
  const input = record(rawInput);
  if (!input || input.observationId !== observation.observationId) return null;
  const elementIndex = finite(input.elementIndex);
  if (elementIndex !== null) {
    const element = observation.elements[elementIndex];
    if (
      element?.x === undefined ||
      element.y === undefined ||
      element.width === undefined ||
      element.height === undefined
    ) {
      return null;
    }
    return { x: element.x + element.width / 2, y: element.y + element.height / 2 };
  }
  if (operation === "drag") {
    const x = finite(input.toX);
    const y = finite(input.toY);
    return x === null || y === null ? null : { x, y };
  }
  const x = finite(input.x);
  const y = finite(input.y);
  return x === null || y === null ? null : { x, y };
};

export const pointerForAction = (
  observation: ComputerUseAppState | undefined,
  operation: ComputerUseOperation,
  input: unknown,
  sequence: number,
): ComputerUsePointerState | undefined => {
  if (!observation) return undefined;
  const coordinate = coordinateForAction(observation, operation, input);
  if (!coordinate) return undefined;
  return {
    xPercent: Math.max(0, Math.min(100, (coordinate.x / observation.screenshot.width) * 100)),
    yPercent: Math.max(0, Math.min(100, (coordinate.y / observation.screenshot.height) * 100)),
    operation,
    sequence,
  };
};
