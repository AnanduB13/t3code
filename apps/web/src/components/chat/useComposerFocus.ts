import type { ComposerHandleRef } from "../../composerHandleContext";
import { useStableCallback } from "../../hooks/useStableCallback";
import { isModelPickerOpen } from "../../modelPickerVisibility";

// Kept out of ChatView: a compiler-memoized closure there pins its render's scope, which pins the
// previous render's, so every thread copy ChatView showed stayed alive until it unmounted.
// `enabled` is false for a workspace pane that is not the active one.
export function useComposerFocus(composerRef: ComposerHandleRef, enabled = true) {
  const focusComposer = useStableCallback(() => {
    if (enabled) composerRef.current?.focusAtEnd();
  });
  const scheduleComposerFocus = useStableCallback(() => {
    window.requestAnimationFrame(() => {
      // The model picker stays open through its own changes, so it keeps focus.
      if (!isModelPickerOpen()) focusComposer();
    });
  });
  return { focusComposer, scheduleComposerFocus };
}
