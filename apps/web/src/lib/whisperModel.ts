export type WhisperPipelineConfiguration = {
  device: "webgpu" | "wasm";
  dtype: {
    encoder_model: "fp16" | "fp32" | "q8";
    decoder_model_merged: "q4";
  };
};

export function whisperPipelineConfigurations(
  hasWebGpu: boolean,
): ReadonlyArray<WhisperPipelineConfiguration> {
  const wasm = {
    device: "wasm",
    dtype: { encoder_model: "q8", decoder_model_merged: "q4" },
  } as const;

  if (!hasWebGpu) return [wasm];

  return [
    {
      device: "webgpu",
      dtype: { encoder_model: "fp16", decoder_model_merged: "q4" },
    },
    {
      device: "webgpu",
      dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
    },
    wasm,
  ];
}
