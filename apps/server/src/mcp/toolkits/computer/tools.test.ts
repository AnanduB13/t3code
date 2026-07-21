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
