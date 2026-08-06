import { describe, expect, it } from "vite-plus/test";
import { whisperTranscriberOptions } from "./whisperOptions";

describe("whisperTranscriberOptions", () => {
  it("lets multilingual Whisper detect the spoken language", () => {
    const options = whisperTranscriberOptions();
    expect(options).not.toHaveProperty("language");
    expect(options).toMatchObject({
      task: "transcribe",
      condition_on_prev_tokens: true,
    });
  });
});
