import { describe, expect, it } from "vite-plus/test";
import { modelLogoDataUrl } from "./modelLogo.ts";

describe("task model logos", () => {
  it.each([
    ["Opus 4.8", "claude"],
    ["anthropic/claude-sonnet-5", "claude"],
    ["Haiku", "claude"],
    ["gpt-6.1-sol", "openai"],
    ["openai/o3", "openai"],
    ["Codex", "openai"],
    ["google/gemini-3.1-pro", "gemini"],
    ["xai/grok-4", "grok"],
  ])("uses the %s model family rather than its harness", (model, family) => {
    expect(modelLogoDataUrl(model)).toBe(modelLogoDataUrl(family));
    expect(modelLogoDataUrl(model)).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("uses catalog metadata for custom aliases and leaves unknown families unbranded", () => {
    expect(modelLogoDataUrl("writing-fast", "Team model", "Anthropic")).toBe(
      modelLogoDataUrl("claude"),
    );
    expect(modelLogoDataUrl("my-custom-model")).toBeNull();
    expect(modelLogoDataUrl("octopus")).toBeNull();
    expect(modelLogoDataUrl()).toBeNull();
  });
});
