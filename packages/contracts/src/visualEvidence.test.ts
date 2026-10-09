import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { VisualEvidenceCaptureInput } from "./visualEvidence.ts";

it.effect("accepts paired full-page and element capture shapes", () =>
  Effect.gen(function* () {
    const decode = Schema.decodeUnknownEffect(VisualEvidenceCaptureInput);
    expect(
      yield* decode({
        target: { kind: "environment-port", port: 5173 },
        mode: "full-page",
        label: "Landing page",
      }),
    ).toMatchObject({ mode: "full-page" });
    expect(
      yield* decode({
        target: { kind: "url", url: "https://example.com" },
        mode: "element",
        locator: "main >> section.pricing",
        label: "Updated pricing",
      }),
    ).toMatchObject({ mode: "element", locator: "main >> section.pricing" });
  }),
);

it.effect("requires a locator only for focused element captures", () =>
  Effect.gen(function* () {
    const decode = Schema.decodeUnknownEffect(VisualEvidenceCaptureInput);
    expect(
      yield* Effect.exit(
        decode({ target: { kind: "url", url: "example.com" }, mode: "element", label: "Hero" }),
      ),
    ).toMatchObject({
      _tag: "Failure",
    });
    expect(
      yield* Effect.exit(
        decode({
          target: { kind: "url", url: "example.com" },
          mode: "full-page",
          locator: "main",
          label: "Landing page",
        }),
      ),
    ).toMatchObject({ _tag: "Failure" });
  }),
);
