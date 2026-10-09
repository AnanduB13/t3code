// @vitest-environment jsdom

import { act, cloneElement, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { compile } from "tailwindcss";
import type { QueuedPrompt } from "@t3tools/client-runtime/state/queued-prompts";
import { MessageId, RunId } from "@t3tools/contracts";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { ComposerBanner } from "./ComposerBanner";
import { QueuedMessageChips } from "./QueuedMessageChips";

vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ render, children }: { render: ReactElement; children: ReactNode }) =>
    cloneElement(render, {}, children),
  TooltipPopup: () => null,
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let stylesheet: HTMLStyleElement | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  stylesheet?.remove();
  vi.unstubAllGlobals();
});

it("shows duplicate queued prompts without other banners and hides the dock when emptied", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  let queuedMessages: ReadonlyArray<QueuedPrompt> = [];
  const renderQueue = () => {
    root!.render(
      <ComposerBanner.Dock>
        <ComposerBanner.Column>
          <QueuedMessageChips
            queuedMessages={queuedMessages}
            onSteer={vi.fn()}
            onRemove={(messageId) => {
              queuedMessages = queuedMessages.filter((message) => message.messageId !== messageId);
              renderQueue();
            }}
            onUpdate={vi.fn()}
            onReorder={vi.fn()}
          />
        </ComposerBanner.Column>
      </ComposerBanner.Dock>,
    );
  };
  await act(renderQueue);
  const dock = host.querySelector<HTMLElement>("[data-slot=composer-banner-attachment]")!;
  // Use the dock's actual CSS utilities to check visibility, not just the presence of markup.
  const tailwind = await compile("@tailwind utilities;");
  stylesheet = document.createElement("style");
  stylesheet.textContent = tailwind.build([...dock.classList]);
  document.head.append(stylesheet);
  expect(getComputedStyle(dock).display).toBe("none");

  queuedMessages = ["first", "second"].map((id) => ({
    messageId: MessageId.make(id),
    runId: RunId.make(`run-${id}`),
    text: "This is a test message.",
    attachments: [],
    queuedAt: "2026-10-06T15:39:58.623Z",
    holdUntilUserAction: false,
  }));
  await act(renderQueue);
  expect(getComputedStyle(dock).display).toBe("flex");
  expect([...dock.querySelectorAll("ol > li")].map((row) => row.textContent)).toEqual([
    expect.stringContaining("This is a test message."),
    expect.stringContaining("This is a test message."),
  ]);

  const removeFirst = () =>
    dock.querySelector<HTMLButtonElement>('button[aria-label="Remove queued message"]')!.click();
  await act(removeFirst);
  expect(dock.querySelectorAll("ol > li")).toHaveLength(1);
  expect(getComputedStyle(dock).display).toBe("flex");
  await act(removeFirst);
  expect(dock.querySelector('[aria-label="Prompt queue"]')).toBeNull();
  expect(getComputedStyle(dock).display).toBe("none");
});
