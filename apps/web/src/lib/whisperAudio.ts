export const WHISPER_SAMPLE_RATE = 16_000;

export function mixAndResampleAudio(
  channels: ReadonlyArray<Float32Array>,
  sourceSampleRate: number,
  targetSampleRate = WHISPER_SAMPLE_RATE,
): Float32Array {
  if (channels.length === 0 || sourceSampleRate <= 0 || targetSampleRate <= 0) {
    return new Float32Array();
  }

  const sourceLength = Math.min(...channels.map((channel) => channel.length));
  if (sourceLength === 0) return new Float32Array();

  const outputLength = Math.max(
    1,
    Math.round((sourceLength * targetSampleRate) / sourceSampleRate),
  );
  const output = new Float32Array(outputLength);
  const sourceStep = sourceSampleRate / targetSampleRate;

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourcePosition = Math.min(sourceLength - 1, outputIndex * sourceStep);
    const lowerIndex = Math.floor(sourcePosition);
    const upperIndex = Math.min(sourceLength - 1, lowerIndex + 1);
    const fraction = sourcePosition - lowerIndex;
    let sample = 0;
    for (const channel of channels) {
      sample += channel[lowerIndex]! * (1 - fraction) + channel[upperIndex]! * fraction;
    }
    output[outputIndex] = Math.max(-1, Math.min(1, sample / channels.length));
  }

  return output;
}

export function hasAudibleSpeech(audio: Float32Array): boolean {
  if (audio.length < WHISPER_SAMPLE_RATE / 4) return false;
  let sumOfSquares = 0;
  for (const sample of audio) sumOfSquares += sample * sample;
  return Math.sqrt(sumOfSquares / audio.length) >= 0.003;
}

export function trimAudioSilence(
  audio: Float32Array,
  sampleRate = WHISPER_SAMPLE_RATE,
): Float32Array {
  if (audio.length === 0 || sampleRate <= 0) return audio;

  const windowSize = Math.max(1, Math.round(sampleRate * 0.02));
  const padding = Math.round(sampleRate * 0.2);
  let sumOfSquares = 0;
  for (const sample of audio) sumOfSquares += sample * sample;
  const globalRms = Math.sqrt(sumOfSquares / audio.length);
  const speechThreshold = Math.max(0.0035, Math.min(0.012, globalRms * 0.18));

  const windowHasSpeech = (start: number): boolean => {
    const end = Math.min(audio.length, start + windowSize);
    let windowSum = 0;
    for (let index = start; index < end; index += 1) {
      windowSum += audio[index]! * audio[index]!;
    }
    return Math.sqrt(windowSum / Math.max(1, end - start)) >= speechThreshold;
  };

  let firstSpeech = -1;
  let lastSpeechEnd = -1;
  for (let start = 0; start < audio.length; start += windowSize) {
    if (!windowHasSpeech(start)) continue;
    if (firstSpeech < 0) firstSpeech = start;
    lastSpeechEnd = Math.min(audio.length, start + windowSize);
  }
  if (firstSpeech < 0 || lastSpeechEnd < 0) return new Float32Array();

  const start = Math.max(0, firstSpeech - padding);
  const end = Math.min(audio.length, lastSpeechEnd + padding);
  return audio.slice(start, end);
}

export function normalizeWhisperTranscript(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function insertTranscriptAtCursor(
  prompt: string,
  cursor: number,
  transcript: string,
): { text: string; cursor: number } {
  const cleanTranscript = normalizeWhisperTranscript(transcript);
  if (!cleanTranscript)
    return { text: prompt, cursor: Math.max(0, Math.min(cursor, prompt.length)) };

  const safeCursor = Math.max(0, Math.min(cursor, prompt.length));
  const before = prompt.slice(0, safeCursor);
  const after = prompt.slice(safeCursor);
  const leadingSpace = before.length > 0 && !/\s$/.test(before) ? " " : "";
  const trailingSpace = after.length > 0 && !/^\s/.test(after) ? " " : "";
  const insertion = `${leadingSpace}${cleanTranscript}${trailingSpace}`;
  return { text: `${before}${insertion}${after}`, cursor: safeCursor + insertion.length };
}
