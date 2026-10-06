// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const stageArtworkState = vi.hoisted(() => ({
  mode: "none" as "artwork" | "none",
  variant: null as "nightly" | "dev" | null,
}));

vi.mock("~/hooks/useSettings", () => ({
  useEnvironmentIdentificationMode: () => stageArtworkState.mode,
}));
vi.mock("../SidebarStageBackdrop", () => ({
  StageBackdropButtonArt: ({ variant }: { variant: string }) => `stage-${variant}`,
  useSidebarStageBackdropVariant: (enabled = true) => (enabled ? stageArtworkState.variant : null),
}));

import { ComposerPrimaryActions } from "./ComposerPrimaryActions";

function renderPendingActions(isRunning: boolean) {
  return renderToStaticMarkup(
    createElement(ComposerPrimaryActions, {
      compact: true,
      pendingAction: {
        questionIndex: 0,
        isLastQuestion: true,
        canAdvance: true,
        isResponding: false,
        isComplete: true,
      },
      isRunning,
      showPlanFollowUpPrompt: false,
      promptHasText: false,
      isSendBusy: false,
      sendDisabledReason: null,
      isConnecting: false,
      isEnvironmentUnavailable: false,
      isPreparingWorktree: false,
      hasSendableContent: false,
      onPreviousPendingQuestion: () => {},
      onInterrupt: () => {},
      onImplementPlanInNewThread: () => {},
    }),
  );
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

async function renderRunningComposer(compact: boolean) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const queuedPrompts: string[] = [];
  const onInterrupt = vi.fn();

  function RunningComposer() {
    const [prompt, setPrompt] = useState("");
    const hasSendableContent = prompt.trim().length > 0;
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          queuedPrompts.push(prompt);
          setPrompt("");
        }}
      >
        <textarea value={prompt} onInput={(event) => setPrompt(event.currentTarget.value)} />
        <ComposerPrimaryActions
          compact={compact}
          pendingAction={null}
          isRunning
          showPlanFollowUpPrompt={false}
          promptHasText={hasSendableContent}
          isSendBusy={false}
          sendDisabledReason={null}
          isConnecting={false}
          isEnvironmentUnavailable={false}
          isPreparingWorktree={false}
          hasSendableContent={hasSendableContent}
          onPreviousPendingQuestion={() => {}}
          onInterrupt={onInterrupt}
          onImplementPlanInNewThread={() => {}}
        />
      </form>
    );
  }

  await act(() => root!.render(<RunningComposer />));
  const input = container.querySelector("textarea")!;
  const typePrompt = async (prompt: string) => {
    await act(() => {
      input.value = prompt;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const button = (label: string) =>
    container!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  return { input, typePrompt, button, queuedPrompts, onInterrupt };
}

function renderSendButton(sendDisabledReason: string | null = null) {
  return renderToStaticMarkup(
    createElement(ComposerPrimaryActions, {
      compact: true,
      pendingAction: null,
      isRunning: false,
      showPlanFollowUpPrompt: false,
      promptHasText: true,
      isSendBusy: false,
      sendDisabledReason,
      isConnecting: false,
      isEnvironmentUnavailable: false,
      isPreparingWorktree: false,
      hasSendableContent: true,
      onPreviousPendingQuestion: () => {},
      onInterrupt: () => {},
      onImplementPlanInNewThread: () => {},
    }),
  );
}

afterEach(async () => {
  await act(() => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  vi.unstubAllGlobals();
  stageArtworkState.mode = "none";
  stageArtworkState.variant = null;
});

describe("ComposerPrimaryActions", () => {
  it("disables and labels the send button while feedback is uploading", () => {
    const markup = renderSendButton("Sending feedback");

    expect(markup).toContain("disabled");
    expect(markup).toContain('aria-label="Sending feedback"');
  });

  it("offers Stop generation while a running turn is waiting for user input", () => {
    expect(renderPendingActions(true)).toContain('aria-label="Stop generation"');
  });

  it("does not offer Stop generation for a pending request without a running turn", () => {
    expect(renderPendingActions(false)).not.toContain('aria-label="Stop generation"');
  });

  it("renders stage artwork inside the send button when artwork identification is active", () => {
    stageArtworkState.mode = "artwork";
    stageArtworkState.variant = "nightly";

    const markup = renderSendButton();

    expect(markup).toContain("stage-nightly");
  });

  it("hides stage artwork when artwork identification is inactive", () => {
    stageArtworkState.variant = "nightly";

    const markup = renderSendButton();

    expect(markup).not.toContain("stage-nightly");
  });

  it.each([true, false])(
    "switches from stop to send and queues a typed prompt with compact=%s",
    async (compact) => {
      const { input, typePrompt, button, queuedPrompts, onInterrupt } =
        await renderRunningComposer(compact);

      expect(button("Stop generation")).not.toBeNull();
      expect(button("Queue message")).toBeNull();

      await typePrompt("Follow up after the current task");

      expect(button("Stop generation")).toBeNull();
      expect(button("Queue message")?.disabled).toBe(false);
      await act(() => button("Queue message")!.click());

      expect(queuedPrompts).toEqual(["Follow up after the current task"]);
      expect(onInterrupt).not.toHaveBeenCalled();
      expect(input.value).toBe("");
      expect(button("Queue message")).toBeNull();
      expect(button("Stop generation")).not.toBeNull();

      await act(() => button("Stop generation")!.click());

      expect(onInterrupt).toHaveBeenCalledOnce();
      expect(queuedPrompts).toHaveLength(1);
    },
  );

  it("restores stop when a running draft is erased or contains only whitespace", async () => {
    const { typePrompt, button, queuedPrompts, onInterrupt } = await renderRunningComposer(true);

    await typePrompt("A draft");
    expect(button("Queue message")).not.toBeNull();

    await typePrompt("   \n");
    expect(button("Stop generation")).not.toBeNull();
    expect(button("Queue message")).toBeNull();

    await typePrompt("Another draft");
    expect(button("Queue message")).not.toBeNull();

    await typePrompt("");
    expect(button("Stop generation")).not.toBeNull();
    expect(button("Queue message")).toBeNull();
    expect(queuedPrompts).toEqual([]);
    expect(onInterrupt).not.toHaveBeenCalled();
  });
});
