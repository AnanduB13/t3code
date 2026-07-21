export type WhisperTranscriberOptions = {
  chunk_length_s: number;
  stride_length_s: number;
  return_timestamps: boolean;
  condition_on_prev_tokens: boolean;
  temperature: number;
  no_speech_threshold: number;
  task?: "transcribe";
  language?: string;
};

export function whisperTranscriberOptions(language?: string): WhisperTranscriberOptions {
  const common = {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
    condition_on_prev_tokens: false,
    temperature: 0,
    no_speech_threshold: 0.6,
  } as const;

  // English-only Whisper checkpoints reject both task and language generation options.
  if (language === "en") return common;
  return {
    ...common,
    task: "transcribe",
    ...(language ? { language } : {}),
  };
}
