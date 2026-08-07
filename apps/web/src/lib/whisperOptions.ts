export type WhisperTranscriberOptions = {
  chunk_length_s: number;
  stride_length_s: number;
  return_timestamps: boolean;
  condition_on_prev_tokens: boolean;
  temperature: number;
  no_speech_threshold: number;
  task: "transcribe";
};

export function whisperTranscriberOptions(): WhisperTranscriberOptions {
  return {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
    // Carry context across chunks so names and technical terms stay consistent in long prompts.
    condition_on_prev_tokens: true,
    temperature: 0,
    no_speech_threshold: 0.6,
    task: "transcribe",
  };
}
