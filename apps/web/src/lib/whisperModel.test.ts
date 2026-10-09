import { describe, expect, it } from "vite-plus/test";
import { whisperPipelineConfigurations } from "./whisperModel";

describe("whisperPipelineConfigurations", () => {
  it("prefers the faster full-model fp16 encoder and keeps quality-preserving fallbacks", () => {
    expect(whisperPipelineConfigurations(true)).toEqual([
      {
        device: "webgpu",
        dtype: { encoder_model: "fp16", decoder_model_merged: "q4" },
      },
      {
        device: "webgpu",
        dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
      },
      {
        device: "wasm",
        dtype: { encoder_model: "q8", decoder_model_merged: "q4" },
      },
    ]);
  });

  it("uses the existing CPU configuration when WebGPU is unavailable", () => {
    expect(whisperPipelineConfigurations(false)).toEqual([
      {
        device: "wasm",
        dtype: { encoder_model: "q8", decoder_model_merged: "q4" },
      },
    ]);
  });
});
