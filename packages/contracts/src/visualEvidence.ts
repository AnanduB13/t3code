import { Schema } from "effect";

import { NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ChatImageAttachment } from "./orchestration.ts";
import { BrowserNavigationTarget } from "./previewAutomation.ts";

export const VisualEvidenceCaptureMode = Schema.Literals(["full-page", "element"]);
export type VisualEvidenceCaptureMode = typeof VisualEvidenceCaptureMode.Type;

export const VisualEvidenceCaptureInput = Schema.Struct({
  target: BrowserNavigationTarget,
  mode: VisualEvidenceCaptureMode,
  locator: Schema.optional(
    TrimmedNonEmptyString.check(Schema.isMaxLength(2_048)).annotate({
      description:
        "Playwright locator for the changed region. Required when mode is element; omit for full-page captures.",
    }),
  ),
  label: TrimmedNonEmptyString.check(Schema.isMaxLength(120)).annotate({
    description:
      "Short human-readable description, such as Landing page or Updated pricing section.",
  }),
  viewport: Schema.optional(
    Schema.Struct({
      width: Schema.Int.check(Schema.isGreaterThanOrEqualTo(320)).check(
        Schema.isLessThanOrEqualTo(2_560),
      ),
      height: Schema.Int.check(Schema.isGreaterThanOrEqualTo(240)).check(
        Schema.isLessThanOrEqualTo(1_600),
      ),
    }),
  ),
  timeoutMs: Schema.optional(
    Schema.Int.check(Schema.isGreaterThan(0)).check(Schema.isLessThanOrEqualTo(60_000)),
  ),
}).check(
  Schema.makeFilter(
    (input) =>
      (input.mode === "element" && input.locator !== undefined) ||
      (input.mode === "full-page" && input.locator === undefined) ||
      "locator is required for element captures and must be omitted for full-page captures.",
  ),
);
export type VisualEvidenceCaptureInput = typeof VisualEvidenceCaptureInput.Type;

export const VisualEvidenceCaptureResult = Schema.Struct({
  attachment: ChatImageAttachment,
  mode: VisualEvidenceCaptureMode,
  label: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  width: NonNegativeInt,
  height: NonNegativeInt,
  screenshot: Schema.Struct({
    mimeType: Schema.Literal("image/jpeg"),
    data: Schema.String,
  }),
});
export type VisualEvidenceCaptureResult = typeof VisualEvidenceCaptureResult.Type;

export class VisualEvidenceCaptureError extends Schema.TaggedErrorClass<VisualEvidenceCaptureError>()(
  "VisualEvidenceCaptureError",
  {
    reason: Schema.Literals([
      "browser-unavailable",
      "invalid-target",
      "navigation-failed",
      "element-not-found",
      "image-too-large",
      "storage-failed",
    ]),
    message: TrimmedNonEmptyString,
  },
) {}
