import { describe, expect, it } from "vite-plus/test";
import {
  hasAudibleSpeech,
  insertTranscriptAtCursor,
  mixAndResampleAudio,
  normalizeWhisperTranscript,
  trimAudioSilence,
} from "./whisperAudio";

describe("Whisper audio helpers", () => {
  it("down-mixes and resamples audio without exceeding the PCM range", () => {
    const result = mixAndResampleAudio(
      [new Float32Array([1, 1, -1, -1]), new Float32Array([1, -1, -1, 1])],
      4,
      2,
    );
    expect(Array.from(result)).toEqual([1, -1]);
  });

  it("rejects empty, short, and silent recordings", () => {
    expect(hasAudibleSpeech(new Float32Array())).toBe(false);
    expect(hasAudibleSpeech(new Float32Array(16_000).fill(0.001))).toBe(false);
    expect(hasAudibleSpeech(new Float32Array(16_000).fill(0.01))).toBe(true);
  });

  it("normalizes whitespace but preserves recognized punctuation and casing", () => {
    expect(normalizeWhisperTranscript("  Fix   parseURL(),\nplease. ")).toBe(
      "Fix parseURL(), please.",
    );
  });

  it("trims long silent boundaries while retaining speech padding", () => {
    const audio = new Float32Array(32_000);
    audio.fill(0.02, 12_000, 20_000);
    const trimmed = trimAudioSilence(audio);
    expect(trimmed.length).toBe(14_720);
    expect(trimmed[0]).toBe(0);
    expect(trimmed[3_360]).toBeCloseTo(0.02);
    expect(trimmed.at(-1)).toBe(0);
  });

  it("returns no samples when no speech boundary can be found", () => {
    expect(trimAudioSilence(new Float32Array(16_000))).toHaveLength(0);
  });

  it("inserts a transcript at the cursor with safe word boundaries", () => {
    expect(insertTranscriptAtCursor("Please now", 6, "fix the tests")).toEqual({
      text: "Please fix the tests now",
      cursor: 20,
    });
    expect(insertTranscriptAtCursor("", 99, "  hello  world ")).toEqual({
      text: "hello world",
      cursor: 11,
    });
  });
});
