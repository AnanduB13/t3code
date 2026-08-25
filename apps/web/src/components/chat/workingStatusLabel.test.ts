import { describe, expect, it } from "vite-plus/test";
import {
  resolveWorkingStatusLabel,
  WORKING_STATUS_LABELS,
  WORKING_STATUS_ROTATION_MS,
} from "./workingStatusLabel";

describe("resolveWorkingStatusLabel", () => {
  it("rotates through every label and wraps back to the beginning", () => {
    const startedAtMs = 1_000;

    for (const [index, label] of WORKING_STATUS_LABELS.entries()) {
      expect(
        resolveWorkingStatusLabel(startedAtMs, startedAtMs + index * WORKING_STATUS_ROTATION_MS),
      ).toBe(label);
    }

    expect(
      resolveWorkingStatusLabel(
        startedAtMs,
        startedAtMs + WORKING_STATUS_LABELS.length * WORKING_STATUS_ROTATION_MS,
      ),
    ).toBe(WORKING_STATUS_LABELS[0]);
  });

  it("does not advance when the supplied clock predates the start", () => {
    expect(resolveWorkingStatusLabel(2_000, 1_000)).toBe(WORKING_STATUS_LABELS[0]);
  });
});
