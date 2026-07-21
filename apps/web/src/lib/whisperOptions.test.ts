import { describe, expect, it } from "vite-plus/test";
import { whisperTranscriberOptions } from "./whisperOptions";

describe("whisperTranscriberOptions", () => {
  it("omits task and language for an English-only checkpoint", () => {
    const options = whisperTranscriberOptions("en");
    expect(options).not.toHaveProperty("task");
    expect(options).not.toHaveProperty("language");
  });

  it("provides transcription and language hints for multilingual checkpoints", () => {
    expect(whisperTranscriberOptions("es")).toMatchObject({
      task: "transcribe",
      language: "es",
    });
    expect(whisperTranscriberOptions()).toMatchObject({ task: "transcribe" });
  });
});
