import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircleIcon, MicIcon, SquareIcon, XIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import {
  hasAudibleSpeech,
  mixAndResampleAudio,
  trimAudioSilence,
  WHISPER_SAMPLE_RATE,
} from "../../lib/whisperAudio";
import { randomUUID } from "../../lib/utils";

type VoiceState = "idle" | "recording" | "loading" | "transcribing";
type WhisperWorkerMessage =
  | { type: "loading"; detail: string; progress?: number }
  | { type: "ready" }
  | { type: "load-error"; message: string }
  | { type: "result"; id: string; text: string }
  | { type: "error"; id: string; message: string };

const MAX_RECORDING_MS = 120_000;
const WHISPER_OPERATION_TIMEOUT_MS = 120_000;
const VISUALIZER_BARS = 32;

async function decodeWhisperAudio(blob: Blob): Promise<Float32Array> {
  const decodingContext = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodingContext.decodeAudioData(await blob.arrayBuffer());
  } finally {
    await decodingContext.close();
  }

  const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) =>
    decoded.getChannelData(index),
  );
  if (typeof OfflineAudioContext === "undefined") {
    return mixAndResampleAudio(channels, decoded.sampleRate);
  }

  const mono = mixAndResampleAudio(channels, decoded.sampleRate, decoded.sampleRate);
  const outputLength = Math.max(1, Math.ceil(decoded.duration * WHISPER_SAMPLE_RATE));
  const resamplingContext = new OfflineAudioContext(1, outputLength, WHISPER_SAMPLE_RATE);
  const sourceBuffer = resamplingContext.createBuffer(1, mono.length, decoded.sampleRate);
  sourceBuffer.copyToChannel(new Float32Array(mono), 0);
  const source = resamplingContext.createBufferSource();
  source.buffer = sourceBuffer;
  source.connect(resamplingContext.destination);
  source.start();
  const rendered = await resamplingContext.startRendering();
  return rendered.getChannelData(0).slice();
}

function FrequencyResponseChart(props: { analyser: AnalyserNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [audioDetected, setAudioDetected] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const frequencies = new Uint8Array(props.analyser.frequencyBinCount);
    const waveform = new Uint8Array(props.analyser.fftSize);
    let animationFrame = 0;
    let previousAudioDetected = false;

    const draw = () => {
      const bounds = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(bounds.width * scale));
      const height = Math.max(1, Math.round(bounds.height * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      props.analyser.getByteFrequencyData(frequencies);
      props.analyser.getByteTimeDomainData(waveform);
      let sumOfSquares = 0;
      for (const value of waveform) {
        const normalized = (value - 128) / 128;
        sumOfSquares += normalized * normalized;
      }
      const detected = Math.sqrt(sumOfSquares / waveform.length) >= 0.025;
      if (detected !== previousAudioDetected) {
        previousAudioDetected = detected;
        setAudioDetected(detected);
      }

      context.clearRect(0, 0, width, height);
      const gap = 2 * scale;
      const barWidth = (width - gap * (VISUALIZER_BARS - 1)) / VISUALIZER_BARS;
      const minimumBarHeight = 2 * scale;
      const gradient = context.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, detected ? "#22c55e" : "#64748b");
      gradient.addColorStop(0.7, detected ? "#38bdf8" : "#94a3b8");
      gradient.addColorStop(1, "#a78bfa");
      context.fillStyle = gradient;
      const speechBandEnd = Math.min(
        frequencies.length - 1,
        Math.round((8_000 / (props.analyser.context.sampleRate / 2)) * frequencies.length),
      );

      for (let index = 0; index < VISUALIZER_BARS; index += 1) {
        // More visual space goes to speech-heavy low and mid frequencies.
        const normalizedPosition = index / (VISUALIZER_BARS - 1);
        const frequencyIndex = Math.min(
          speechBandEnd,
          Math.round(normalizedPosition ** 2 * speechBandEnd),
        );
        const magnitude = frequencies[frequencyIndex]! / 255;
        const barHeight = Math.max(minimumBarHeight, magnitude * height);
        const x = index * (barWidth + gap);
        context.beginPath();
        context.roundRect(x, height - barHeight, barWidth, barHeight, barWidth / 2);
        context.fill();
      }
      animationFrame = window.requestAnimationFrame(draw);
    };

    draw();
    return () => window.cancelAnimationFrame(animationFrame);
  }, [props.analyser]);

  return (
    <div
      className="absolute right-0 bottom-full z-30 mb-2 w-64 rounded-xl border border-border/70 bg-popover/95 p-3 text-popover-foreground shadow-lg backdrop-blur-xl"
      data-whisper-frequency-response="true"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-medium">Frequency response</span>
        <span
          className={
            audioDetected
              ? "inline-flex items-center gap-1.5 text-[11px] text-green-500"
              : "inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
          }
          aria-live="polite"
        >
          <span
            className={
              audioDetected
                ? "size-1.5 rounded-full bg-green-500 shadow-[0_0_6px_currentColor]"
                : "size-1.5 rounded-full bg-muted-foreground/50"
            }
          />
          {audioDetected ? "Audio detected" : "Listening…"}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="h-16 w-full"
        role="img"
        aria-label="Live microphone frequency response from low to high frequencies"
      />
      <div className="mt-1 flex justify-between text-[9px] uppercase tracking-wide text-muted-foreground/70">
        <span>Low</span>
        <span>Mid</span>
        <span>High</span>
      </div>
    </div>
  );
}

function microphoneErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access was denied. Allow it in your browser settings and try again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone was found.";
  }
  return "The microphone could not be started.";
}

export function WhisperVoiceInput(props: {
  disabled: boolean;
  onTranscript: (text: string) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const operationTimeoutRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<number | null>(null);

  const getWhisperWorker = useCallback((): Worker => {
    const worker =
      workerRef.current ??
      new Worker(new URL("../../workers/whisper.worker.ts", import.meta.url), {
        type: "module",
      });
    workerRef.current = worker;
    return worker;
  }, []);

  const preloadWhisper = useCallback(() => {
    getWhisperWorker().postMessage({ type: "load" }, []);
  }, [getWhisperWorker]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setAnalyser(null);
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") void audioContext.close();
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const clearOperationTimeout = useCallback(() => {
    if (operationTimeoutRef.current !== null) {
      window.clearTimeout(operationTimeoutRef.current);
      operationTimeoutRef.current = null;
    }
  }, []);

  const resetWhisperWorker = useCallback(() => {
    clearOperationTimeout();
    requestIdRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    setLoadingProgress(null);
    setState("idle");
  }, [clearOperationTimeout]);

  useEffect(
    () => () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      stopStream();
      clearOperationTimeout();
      workerRef.current?.terminate();
    },
    [clearOperationTimeout, stopStream],
  );

  const transcribe = useCallback(
    async (blob: Blob) => {
      try {
        setState("transcribing");
        const audio = trimAudioSilence(await decodeWhisperAudio(blob));
        if (!hasAudibleSpeech(audio)) {
          throw new Error(
            "No clear speech was detected. Please speak a little louder and try again.",
          );
        }

        const worker = getWhisperWorker();
        const requestId = randomUUID();
        requestIdRef.current = requestId;
        const handleMessage = (event: MessageEvent<WhisperWorkerMessage>) => {
          const message = event.data;
          if (message.type === "loading") {
            setState("loading");
            setLoadingProgress(message.progress ?? null);
            return;
          }
          if (message.type === "ready") return;
          if (message.type === "load-error") {
            handleFailure(message.message);
            return;
          }
          if (message.id !== requestIdRef.current) return;
          worker.removeEventListener("message", handleMessage);
          worker.removeEventListener("error", handleError);
          clearOperationTimeout();
          requestIdRef.current = null;
          setLoadingProgress(null);
          setState("idle");
          if (message.type === "result") {
            if (message.text.trim()) props.onTranscript(message.text);
            else toastManager.add({ type: "error", title: "No speech detected" });
          } else {
            toastManager.add({
              type: "error",
              title: "Could not transcribe recording",
              description: message.message,
            });
          }
        };
        const handleFailure = (message: string) => {
          worker.removeEventListener("message", handleMessage);
          worker.removeEventListener("error", handleError);
          clearOperationTimeout();
          requestIdRef.current = null;
          setState("idle");
          setLoadingProgress(null);
          worker.terminate();
          workerRef.current = null;
          toastManager.add({
            type: "error",
            title: "Could not load local Whisper",
            description: message,
          });
        };
        const handleError = () => handleFailure("The Whisper worker stopped unexpectedly.");
        worker.addEventListener("message", handleMessage);
        worker.addEventListener("error", handleError, { once: true });
        clearOperationTimeout();
        operationTimeoutRef.current = window.setTimeout(() => {
          handleFailure(
            "Loading or transcription timed out. Please check your connection and retry.",
          );
        }, WHISPER_OPERATION_TIMEOUT_MS);
        worker.postMessage(
          {
            type: "transcribe",
            id: requestId,
            audio,
          },
          [audio.buffer],
        );
      } catch (error) {
        setState("idle");
        toastManager.add({
          type: "error",
          title: "Could not transcribe recording",
          description: error instanceof Error ? error.message : "The audio could not be read.",
        });
      }
    },
    [clearOperationTimeout, getWhisperWorker, props],
  );

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toastManager.add({ type: "error", title: "Voice input is not supported in this browser" });
      return;
    }
    try {
      // Let model download and GPU initialization overlap microphone startup and permission UI.
      preloadWhisper();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: WHISPER_SAMPLE_RATE },
        },
      });
      streamRef.current = stream;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      await audioContext.resume();
      const nextAnalyser = audioContext.createAnalyser();
      nextAnalyser.fftSize = 256;
      nextAnalyser.minDecibels = -90;
      nextAnalyser.maxDecibels = -10;
      nextAnalyser.smoothingTimeConstant = 0.78;
      audioContext.createMediaStreamSource(stream).connect(nextAnalyser);
      setAnalyser(nextAnalyser);
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        recorderRef.current = null;
        stopStream();
        if (blob.size > 0) void transcribe(blob);
        else setState("idle");
      };
      recorder.start(250);
      setState("recording");
      timeoutRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, MAX_RECORDING_MS);
    } catch (error) {
      stopStream();
      setState("idle");
      toastManager.add({
        type: "error",
        title: "Could not start voice input",
        description: microphoneErrorMessage(error),
      });
    }
  }, [preloadWhisper, stopStream, transcribe]);

  const label =
    state === "recording"
      ? "Stop recording and transcribe"
      : state === "loading"
        ? loadingProgress === null
          ? "Loading local Whisper model — click to cancel"
          : `Loading local Whisper model ${Math.round(loadingProgress)}% — click to cancel`
        : state === "transcribing"
          ? "Transcribing recording"
          : "Talk to write a prompt with local Whisper";
  const busy = state === "loading" || state === "transcribing";

  return (
    <div className="relative flex shrink-0 items-center">
      {state === "recording" && analyser ? <FrequencyResponseChart analyser={analyser} /> : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={
                state === "recording"
                  ? "bg-red-500/12 text-red-500 hover:bg-red-500/20"
                  : "text-muted-foreground"
              }
              disabled={props.disabled}
              aria-label={label}
              aria-pressed={state === "recording"}
              onPointerEnter={preloadWhisper}
              onFocus={preloadWhisper}
              onPointerDown={(event) => {
                preloadWhisper();
                event.preventDefault();
              }}
              onClick={() => {
                if (busy) {
                  resetWhisperWorker();
                } else if (state === "recording") {
                  recorderRef.current?.stop();
                } else {
                  void startRecording();
                }
              }}
            />
          }
        >
          {busy ? (
            <span className="relative flex items-center justify-center">
              <LoaderCircleIcon className="animate-spin" />
              <XIcon className="absolute size-2.5" />
            </span>
          ) : state === "recording" ? (
            <SquareIcon />
          ) : (
            <MicIcon />
          )}
        </TooltipTrigger>
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </div>
  );
}
