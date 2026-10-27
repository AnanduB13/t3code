import { act, createElement, useLayoutEffect, type EffectCallback } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { VoiceInputControllerInput } from "./useVoiceInputController.types";

const native = vi.hoisted(() => ({
  startDictation: vi.fn<(locale: string, sessionId: string) => Promise<string | null>>(),
  cancelDictation: vi.fn<(sessionId: string) => Promise<void>>(),
}));

vi.mock("expo", () => ({ requireOptionalNativeModule: () => native }));
vi.mock("react-native-reanimated", () => ({ useSharedValue: (value: number[]) => ({ value }) }));
vi.mock("@react-navigation/native", async () => {
  const { useEffect } = await import("react");
  return { useFocusEffect: (effect: EffectCallback) => useEffect(effect, [effect]) };
});

import { useVoiceInputController } from "./useVoiceInputController.android";

let renderer: ReactTestRenderer | undefined;
let controller: ReturnType<typeof useVoiceInputController>;
let input: VoiceInputControllerInput;

function Harness() {
  const value = useVoiceInputController(input);
  useLayoutEffect(() => {
    controller = value;
  }, [value]);
  return null;
}

async function render() {
  await act(async () => {
    if (renderer) renderer.update(createElement(Harness));
    else renderer = create(createElement(Harness));
  });
}

async function beginDictation() {
  const result = Promise.withResolvers<string | null>();
  native.startDictation.mockReturnValueOnce(result.promise);
  let finished!: Promise<void>;
  await act(async () => {
    finished = controller.start();
  });
  return {
    async resolve(text: string | null) {
      await act(async () => {
        result.resolve(text);
        await finished;
      });
    },
    async reject(error: Error) {
      await act(async () => {
        result.reject(error);
        await finished;
      });
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  native.cancelDictation.mockResolvedValue(undefined);
  input = {
    ownerKey: "environment:thread-a",
    draftMessage: "Build old code",
    selection: { start: 6, end: 9 },
    onChangeDraftMessage: vi.fn(),
    onChangeSelection: vi.fn(),
  };
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

describe("Android composer dictation", () => {
  it("offers voice input and inserts speech at the captured selection for review", async () => {
    await render();
    expect(controller.isAvailable).toBe(true);
    const recording = await beginDictation();
    expect(controller.blocksSubmission).toBe(true);
    expect(controller.freezesEditor).toBe(true);
    expect(native.startDictation).toHaveBeenCalledWith(
      Intl.DateTimeFormat().resolvedOptions().locale,
      expect.any(String),
    );

    await recording.resolve("new");

    expect(input.onChangeDraftMessage).toHaveBeenCalledExactlyOnceWith("Build new code");
    expect(input.onChangeSelection).toHaveBeenCalledExactlyOnceWith({ start: 9, end: 9 });
    expect(controller.state.phase).toBe("idle");
    expect(controller.blocksSubmission).toBe(false);
  });

  it("preserves the draft when the speech dialog is dismissed", async () => {
    await render();
    const recording = await beginDictation();
    await recording.resolve(null);
    expect(input.onChangeDraftMessage).not.toHaveBeenCalled();
    expect(controller.state.phase).toBe("idle");
  });

  it("cancels the matching native session and ignores a late transcript", async () => {
    await render();
    const recording = await beginDictation();
    await act(async () => controller.cancel());
    expect(native.cancelDictation).toHaveBeenCalledExactlyOnceWith(
      native.startDictation.mock.calls[0]?.[1],
    );
    await recording.resolve("discard this");
    expect(input.onChangeDraftMessage).not.toHaveBeenCalled();
    expect(controller.state.phase).toBe("idle");
  });

  it("cancels when switching threads and keeps the next draft unchanged", async () => {
    await render();
    const recording = await beginDictation();
    input = { ...input, ownerKey: "environment:thread-b" };
    await render();
    expect(native.cancelDictation).toHaveBeenCalledTimes(1);
    await recording.resolve("belongs to thread a");
    expect(input.onChangeDraftMessage).not.toHaveBeenCalled();
  });

  it("rejects a transcript if the draft was edited and then restored", async () => {
    await render();
    const recording = await beginDictation();
    input = { ...input, draftMessage: "Changed while listening" };
    await render();
    input = { ...input, draftMessage: "Build old code" };
    await render();
    await recording.resolve("stale speech");
    expect(input.onChangeDraftMessage).not.toHaveBeenCalled();
    expect(controller.state).toMatchObject({ phase: "error", errorAction: "retry" });
  });

  it("discards a late result after leaving the composer", async () => {
    await render();
    const recording = await beginDictation();
    await act(async () => renderer?.unmount());
    renderer = undefined;
    expect(native.cancelDictation).toHaveBeenCalledTimes(1);
    await recording.resolve("late result");
    expect(input.onChangeDraftMessage).not.toHaveBeenCalled();
  });

  it("allows retry after the speech service fails or returns no text", async () => {
    await render();
    const first = await beginDictation();
    await first.reject(new Error("Install or enable a speech recognition app to use voice input."));
    expect(controller.state).toMatchObject({
      phase: "error",
      error: "Install or enable a speech recognition app to use voice input.",
      errorAction: "retry",
    });
    const second = await beginDictation();
    await second.resolve(" ");
    expect(controller.state).toMatchObject({
      phase: "error",
      error: "No speech was recognized. Try again.",
    });
    const third = await beginDictation();
    await third.resolve("new");
    expect(input.onChangeDraftMessage).toHaveBeenCalledExactlyOnceWith("Build new code");
    expect(controller.state.phase).toBe("idle");
  });

  it("does not overlap native requests, including while cancellation settles", async () => {
    await render();
    const recording = await beginDictation();
    await act(async () => {
      await controller.start();
      controller.cancel();
      await controller.start();
    });
    expect(native.startDictation).toHaveBeenCalledTimes(1);
    await recording.resolve(null);
    const next = await beginDictation();
    expect(native.startDictation).toHaveBeenCalledTimes(2);
    expect(native.startDictation.mock.calls[0]?.[1]).not.toBe(
      native.startDictation.mock.calls[1]?.[1],
    );
    await next.resolve("new");
  });

  it.each(["disabled", "missing owner"])("does not start when %s", async (condition) => {
    input = condition === "disabled" ? { ...input, disabled: true } : { ...input, ownerKey: null };
    await render();
    await act(async () => controller.start());
    expect(native.startDictation).not.toHaveBeenCalled();
  });
});
