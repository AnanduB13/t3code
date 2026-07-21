import { pipeline } from "@huggingface/transformers";
import { type WhisperTranscriberOptions, whisperTranscriberOptions } from "../lib/whisperOptions";

/* oxlint-disable unicorn/require-post-message-target-origin -- Worker.postMessage has no target origin. */

type Transcriber = (
  audio: Float32Array,
  options: WhisperTranscriberOptions,
) => Promise<{ text: string }>;
type TranscribeRequest = {
  type: "transcribe";
  id: string;
  audio: Float32Array;
  language?: string;
};
type WorkerRequest = { type: "load"; language?: string } | TranscribeRequest;

let transcriberPromise: Promise<Transcriber> | null = null;

function loadingProgress(progress: unknown): number | undefined {
  if (!progress || typeof progress !== "object" || !("progress" in progress)) return undefined;
  const value = progress.progress;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : undefined;
}

function getTranscriber(language?: string): Promise<Transcriber> {
  const isEnglish = language === "en";
  const model = isEnglish ? "onnx-community/whisper-tiny.en" : "onnx-community/whisper-tiny";
  transcriberPromise ??= pipeline("automatic-speech-recognition", model, {
    // Tiny cuts both download and inference latency substantially. Keeping its encoder at q8
    // preserves much more speech detail than the original all-q4 implementation.
    device: "wasm",
    dtype: { encoder_model: "q8", decoder_model_merged: "q4" },
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
  return transcriberPromise;
}

function runTranscription(transcriber: Transcriber, request: TranscribeRequest) {
  return transcriber(request.audio, whisperTranscriberOptions(request.language));
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type === "load") {
    try {
      await getTranscriber(event.data.language);
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
    const transcriber = await getTranscriber(event.data.language);
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
