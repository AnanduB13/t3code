import { env, pipeline } from "@huggingface/transformers";
import onnxRuntimeModuleUrl from "../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs?url";
import onnxRuntimeWasmUrl from "../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm?url";
import {
  type WhisperPipelineConfiguration,
  whisperPipelineConfigurations,
} from "../lib/whisperModel";
import { type WhisperTranscriberOptions, whisperTranscriberOptions } from "../lib/whisperOptions";
import { configureLocalWhisperRuntime } from "../lib/whisperRuntime";

/* oxlint-disable unicorn/require-post-message-target-origin -- Worker.postMessage has no target origin. */

type Transcriber = (
  audio: Float32Array,
  options: WhisperTranscriberOptions,
) => Promise<{ text: string }>;
type TranscribeRequest = {
  type: "transcribe";
  id: string;
  audio: Float32Array;
};
type WorkerRequest = { type: "load" } | TranscribeRequest;

configureLocalWhisperRuntime(
  env,
  { mjs: onnxRuntimeModuleUrl, wasm: onnxRuntimeWasmUrl },
  self.location.href,
);

let transcriberPromise: Promise<Transcriber> | null = null;

function loadingProgress(progress: unknown): number | undefined {
  if (!progress || typeof progress !== "object" || !("progress" in progress)) return undefined;
  const value = progress.progress;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : undefined;
}

function loadTranscriber(configuration: WhisperPipelineConfiguration): Promise<Transcriber> {
  return pipeline("automatic-speech-recognition", "onnx-community/whisper-base", {
    ...configuration,
    progress_callback: (progress) => {
      const detail =
        typeof progress === "object" && progress && "status" in progress
          ? String(progress.status)
          : "loading";
      self.postMessage({
        type: "loading",
        detail,
        progress: loadingProgress(progress),
      });
    },
  }) as unknown as Promise<Transcriber>;
}

async function loadFastestSupportedTranscriber(): Promise<Transcriber> {
  let lastError: unknown;
  for (const configuration of whisperPipelineConfigurations("gpu" in navigator)) {
    try {
      return await loadTranscriber(configuration);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("No supported Whisper runtime was found.");
}

function getTranscriber(): Promise<Transcriber> {
  transcriberPromise ??= loadFastestSupportedTranscriber();
  return transcriberPromise;
}

function runTranscription(transcriber: Transcriber, request: TranscribeRequest) {
  return transcriber(request.audio, whisperTranscriberOptions());
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type === "load") {
    try {
      await getTranscriber();
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({
        type: "load-error",
        message: error instanceof Error ? error.message : "Whisper model loading failed.",
      });
    }
    return;
  }

  try {
    const transcriber = await getTranscriber();
    const result = await runTranscription(transcriber, event.data);
    self.postMessage({ type: "result", id: event.data.id, text: result.text });
  } catch (error) {
    self.postMessage({
      type: "error",
      id: event.data.id,
      message: error instanceof Error ? error.message : "Whisper transcription failed.",
    });
  }
});
