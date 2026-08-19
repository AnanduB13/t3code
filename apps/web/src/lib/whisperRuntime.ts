type WhisperRuntimeEnvironment = {
  backends: {
    onnx: {
      wasm?: {
        wasmPaths?: unknown;
      };
    };
  };
};

export function configureLocalWhisperRuntime(
  environment: WhisperRuntimeEnvironment,
  assets: { readonly mjs: string; readonly wasm: string },
  baseUrl: string,
): void {
  environment.backends.onnx.wasm ??= {};
  environment.backends.onnx.wasm.wasmPaths = {
    mjs: new URL(assets.mjs, baseUrl).href,
    wasm: new URL(assets.wasm, baseUrl).href,
  };
}
