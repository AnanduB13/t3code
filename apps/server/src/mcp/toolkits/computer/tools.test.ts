import { expect, it } from "@effect/vitest";
import { Tool } from "effect/unstable/ai";

import { ComputerUseToolkit } from "./tools.ts";

it("exports provider-compatible top-level object parameter schemas", () => {
  for (const tool of Object.values(ComputerUseToolkit.tools)) {
    const schema = Tool.getJsonSchema(tool) as {
      readonly type?: unknown;
      readonly anyOf?: unknown;
      readonly oneOf?: unknown;
    };
    expect(schema.type, `${tool.name} must export a top-level object schema`).toBe("object");
    expect(schema.anyOf, `${tool.name} must not export a root anyOf`).toBeUndefined();
    expect(schema.oneOf, `${tool.name} must not export a root oneOf`).toBeUndefined();
  }
});

it("requires an exact window and fresh observation for every input action", () => {
  for (const name of [
    "computer_move",
    "computer_click",
    "computer_drag",
    "computer_press_key",
    "computer_scroll",
    "computer_type_text",
  ] as const) {
    const schema = Tool.getJsonSchema(ComputerUseToolkit.tools[name]) as {
      readonly required?: readonly string[];
    };
    expect(schema.required, `${name} must be bound to an observed window`).toEqual(
      expect.arrayContaining(["windowId", "observationId"]),
    );
  }
});
