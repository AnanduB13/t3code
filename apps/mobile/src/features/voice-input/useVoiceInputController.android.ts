import { useFocusEffect } from "@react-navigation/native";
import { requireOptionalNativeModule } from "expo";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useSharedValue } from "react-native-reanimated";

import {
  resolveTranscriptCommit,
  voiceInputBlocksSubmission,
  type VoiceInputState,
} from "@t3tools/client-runtime/voice-input";
import type { VoiceInputControllerInput } from "./useVoiceInputController.types";
import { VOICE_WAVEFORM_SAMPLE_COUNT } from "./voiceInputMetering";
import { createVoiceInputTarget } from "./voiceInputSession";

interface AndroidDictationModule {
  startDictation(locale: string, sessionId: string): Promise<string | null>;
  cancelDictation(sessionId: string): Promise<void>;
}

type AndroidDictationSession = {
  id: string;
  cancelled: boolean;
  unsubscribe: (() => void) | null;
};

const nativeDictation =
  requireOptionalNativeModule<Partial<AndroidDictationModule>>("T3NativeControls");
const IDLE_STATE: VoiceInputState = { phase: "idle", error: null, errorAction: null };

async function runDictation(
  session: AndroidDictationSession,
  locale: string,
  callbacks: {
    readonly onTranscript: (transcript: string | null) => void;
    readonly onError: (error: unknown) => void;
    readonly onSettled: () => void;
  },
): Promise<void> {
  try {
    const transcript = await nativeDictation?.startDictation?.(locale, session.id);
    if (!session.cancelled) callbacks.onTranscript(transcript ?? null);
  } catch (error) {
    if (!session.cancelled) callbacks.onError(error);
  } finally {
    session.unsubscribe?.();
    session.unsubscribe = null;
    callbacks.onSettled();
  }
}

export function useVoiceInputController(input: VoiceInputControllerInput) {
  const [state, setState] = useState<VoiceInputState>(IDLE_STATE);
  const audioLevels = useSharedValue(Array<number>(VOICE_WAVEFORM_SAMPLE_COUNT).fill(0));
  const instanceId = useId();
  const operationRef = useRef(0);
  const sessionRef = useRef<AndroidDictationSession | null>(null);
  const latestInputRef = useRef(input);
  const cancel = useCallback(() => {
    const session = sessionRef.current;
    if (session && !session.cancelled) {
      session.cancelled = true;
      session.unsubscribe?.();
      session.unsubscribe = null;
      void nativeDictation?.cancelDictation?.(session.id).catch(() => {});
    }
    setState(IDLE_STATE);
  }, []);

  // oxlint-disable-next-line t3code/react-effect-budget -- Synchronize native dictation ownership after a composer commits so an abandoned render cannot cancel the active session.
  useLayoutEffect(() => {
    const previous = latestInputRef.current;
    latestInputRef.current = input;
    if (previous.ownerKey !== input.ownerKey) cancel();
  }, [cancel, input]);

  useFocusEffect(useCallback(() => cancel, [cancel]));
  // oxlint-disable-next-line t3code/react-effect-budget -- Cancel the external speech activity and release its draft subscription when this composer unmounts.
  useEffect(() => cancel, [cancel]);

  const start = useCallback(async () => {
    const current = latestInputRef.current;
    if (current.disabled || !current.ownerKey || sessionRef.current) return;
    if (!nativeDictation?.startDictation) return;

    const target = createVoiceInputTarget(
      current.ownerKey,
      current.readDraftMessage,
      (text, selection) => {
        const latest = latestInputRef.current;
        latest.onChangeSelection(selection);
        latest.onChangeDraftMessage(text);
      },
      current.selection,
      current.subscribeToDraftChanges,
    );
    const captured = target.readDraft();
    if (!captured) return;
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const session: AndroidDictationSession = {
      id: `${instanceId}:${++operationRef.current}`,
      cancelled: false,
      unsubscribe: target.subscribe(),
    };
    sessionRef.current = session;
    // Android's speech activity owns capture, permissions, and confirmation.
    // It backgrounds T3, so app background events must not cancel this request.
    setState({ phase: "preparing", error: null, errorAction: null });
    return runDictation(session, locale, {
      onTranscript: (transcript) => {
        if (transcript === null) {
          setState(IDLE_STATE);
          return;
        }
        const latest = latestInputRef.current;
        const result = resolveTranscriptCommit(
          captured,
          latest.ownerKey === captured.ownerKey ? target.readDraft() : null,
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
        target.commitDraft(result.text, result.selection);
        setState(IDLE_STATE);
      },
      onError: (error) => {
        setState({
          phase: "error",
          error: error instanceof Error ? error.message : "Could not start voice input.",
          errorAction: "retry",
        });
      },
      onSettled: () => {
        if (sessionRef.current === session) sessionRef.current = null;
      },
    });
  }, [instanceId]);

  const isBusy = voiceInputBlocksSubmission(state);
  return {
    isAvailable: typeof nativeDictation?.startDictation === "function",
    state,
    audioLevels,
    elapsedSeconds: 0,
    isBusy,
    freezesEditor: isBusy,
    blocksSubmission: isBusy,
    start,
    stop: cancel,
    cancel,
  };
}
