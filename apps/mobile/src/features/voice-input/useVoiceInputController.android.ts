import { useFocusEffect } from "@react-navigation/native";
import { requireOptionalNativeModule } from "expo";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useSharedValue } from "react-native-reanimated";

import {
  resolveTranscriptCommit,
  voiceInputBlocksSubmission,
  voiceInputFreezesEditor,
  type VoiceDraftSnapshot,
  type VoiceInputState,
} from "@t3tools/client-runtime/voice-input";
import type { VoiceInputControllerInput } from "./useVoiceInputController.types";
import { VOICE_WAVEFORM_SAMPLE_COUNT } from "./voiceInputMetering";

interface AndroidDictationModule {
  startDictation(locale: string, sessionId: string): Promise<string | null>;
  cancelDictation(sessionId: string): Promise<void>;
}

const nativeDictation =
  requireOptionalNativeModule<Partial<AndroidDictationModule>>("T3NativeControls");
const IDLE_STATE: VoiceInputState = { phase: "idle", error: null, errorAction: null };

export function useVoiceInputController(input: VoiceInputControllerInput) {
  const [state, setState] = useState<VoiceInputState>(IDLE_STATE);
  const audioLevels = useSharedValue(Array<number>(VOICE_WAVEFORM_SAMPLE_COUNT).fill(0));
  const instanceId = useId();
  const operationRef = useRef(0);
  const sessionRef = useRef<{ id: string; cancelled: boolean } | null>(null);
  const latestInputRef = useRef(input);
  const revisionRef = useRef(0);
  const cancel = useCallback(() => {
    const session = sessionRef.current;
    if (session && !session.cancelled) {
      session.cancelled = true;
      void nativeDictation?.cancelDictation?.(session.id).catch(() => {});
    }
    setState(IDLE_STATE);
  }, []);

  useLayoutEffect(() => {
    const previous = latestInputRef.current;
    if (previous.ownerKey !== input.ownerKey || previous.draftMessage !== input.draftMessage) {
      revisionRef.current += 1;
    }
    latestInputRef.current = input;
    if (previous.ownerKey !== input.ownerKey) cancel();
  }, [cancel, input]);

  useFocusEffect(useCallback(() => cancel, [cancel]));
  useEffect(() => cancel, [cancel]);

  const start = useCallback(async () => {
    const current = latestInputRef.current;
    if (current.disabled || !current.ownerKey || sessionRef.current) return;
    if (!nativeDictation?.startDictation) return;

    const captured: VoiceDraftSnapshot = {
      ownerKey: current.ownerKey,
      text: current.draftMessage,
      selection: current.selection,
      revision: revisionRef.current,
    };
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const session = { id: `${instanceId}:${++operationRef.current}`, cancelled: false };
    sessionRef.current = session;
    // Android's speech activity owns capture, permissions, and confirmation.
    // It backgrounds T3, so app background events must not cancel this request.
    setState({ phase: "preparing", error: null, errorAction: null });
    try {
      const transcript = await nativeDictation.startDictation(locale, session.id);
      if (session.cancelled) return;
      if (transcript === null) {
        setState(IDLE_STATE);
        return;
      }
      const latest = latestInputRef.current;
      const result = resolveTranscriptCommit(
        captured,
        latest.ownerKey
          ? {
              ownerKey: latest.ownerKey,
              text: latest.draftMessage,
              selection: latest.selection,
              revision: revisionRef.current,
            }
          : null,
        transcript,
        locale,
      );
      if (result.kind !== "commit") {
        setState({
          phase: "error",
          error:
            result.kind === "empty"
              ? "No speech was recognized. Try again."
              : "Your draft changed. Try voice input again.",
          errorAction: "retry",
        });
        return;
      }
      latest.onChangeSelection(result.selection);
      latest.onChangeDraftMessage(result.text);
      setState(IDLE_STATE);
    } catch (error) {
      if (!session.cancelled) {
        setState({
          phase: "error",
          error: error instanceof Error ? error.message : "Could not start voice input.",
          errorAction: "retry",
        });
      }
    } finally {
      if (sessionRef.current === session) sessionRef.current = null;
    }
  }, [instanceId]);

  return {
    isAvailable: typeof nativeDictation?.startDictation === "function",
    state,
    audioLevels,
    elapsedSeconds: 0,
    isBusy: voiceInputBlocksSubmission(state),
    freezesEditor: voiceInputFreezesEditor(state),
    blocksSubmission: voiceInputBlocksSubmission(state),
    start,
    stop: cancel,
    cancel,
  };
}
