import { describe, expect, it } from "vite-plus/test";

import { configureLocalWhisperRuntime } from "./whisperRuntime";

describe("configureLocalWhisperRuntime", () => {
  it("replaces the CDN fallback with same-origin runtime assets", () => {
    const environment = {
      backends: {
        onnx: {
          wasm: {
            wasmPaths: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/",
          },
        },
      },
    };

    configureLocalWhisperRuntime(
      environment,
      {
        mjs: "/assets/ort-runtime.mjs",
        wasm: "/assets/ort-runtime.wasm",
      },
      "https://t3.tailnet.example/project/thread",
    );

    expect(environment.backends.onnx.wasm.wasmPaths).toEqual({
      mjs: "https://t3.tailnet.example/assets/ort-runtime.mjs",
      wasm: "https://t3.tailnet.example/assets/ort-runtime.wasm",
    });
  });

  it("initializes missing ONNX WebAssembly settings", () => {
    const environment: {
      backends: { onnx: { wasm?: { wasmPaths?: unknown } } };
    } = { backends: { onnx: {} } };

    configureLocalWhisperRuntime(
      environment,
      { mjs: "runtime.mjs", wasm: "runtime.wasm" },
      "https://t3.example/assets/worker.js",
    );

    expect(environment.backends.onnx.wasm?.wasmPaths).toEqual({
      mjs: "https://t3.example/assets/runtime.mjs",
      wasm: "https://t3.example/assets/runtime.wasm",
    });
  });
});
