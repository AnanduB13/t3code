// @vitest-environment jsdom
import { ApprovalRequestId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";

describe("ComposerPendingApprovalActions", () => {
  it("keeps the main decisions visible and secondary decisions in the menu", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingApprovalActions
        requestId={ApprovalRequestId.make("approval-1")}
        isResponding={false}
        onRespondToApproval={async () => undefined}
      />,
    );

    expect(markup).toContain(">Decline<");
    expect(markup).toContain(">Approve<");
    expect(markup).not.toContain(">Cancel<");
    expect(markup).not.toContain("Always allow this session");
  });

  it("keeps secondary provider labels out of the compact action row", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingApprovalActions
        requestId={ApprovalRequestId.make("approval-safari")}
        isResponding={false}
        options={[
          { decision: "decline", label: "Decline" },
          { decision: "acceptAlways", label: "Always allow Safari" },
          { decision: "accept", label: "Approve" },
        ]}
        onRespondToApproval={async () => undefined}
      />,
    );

    expect(markup).not.toContain("Always allow Safari");
    expect(markup).toContain(">Approve<");
    expect(markup).not.toContain("Always allow this session");
  });

  it("shows the provider warning when opening secondary approval choices", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const respond = vi.fn(async () => undefined);
    try {
      await act(() =>
        root.render(
          <ComposerPendingApprovalActions
            requestId={ApprovalRequestId.make("approval-1")}
            isResponding={false}
            options={[
              { decision: "accept", label: "Allow once" },
              {
                decision: "acceptForSession",
                label: "Allow for this thread",
                warning: "Untrusted files could re-run this action without asking.",
              },
              { decision: "decline", label: "Deny" },
            ]}
            onRespondToApproval={respond}
          />,
        ),
      );
      await act(() =>
        container.querySelector<HTMLButtonElement>('[aria-label="More approval options"]')!.click(),
      );
      const choice = document.querySelector<HTMLElement>('[role="menuitem"][aria-description]')!;
      expect(choice.textContent).toContain("Allow for this thread");
      expect(choice.getAttribute("aria-description")).toBe(
        "Untrusted files could re-run this action without asking.",
      );
      await act(() => choice.click());
      expect(respond).toHaveBeenCalledWith("approval-1", "acceptForSession");
    } finally {
      await act(() => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("preserves provider labels for the main decisions", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingApprovalActions
        requestId={ApprovalRequestId.make("approval-1")}
        isResponding={false}
        options={[
          { decision: "accept", label: "Allow once" },
          { decision: "decline", label: "Deny" },
        ]}
        onRespondToApproval={async () => undefined}
      />,
    );

    expect(markup).toContain("Allow once");
    expect(markup).toContain("Deny");
    expect(markup).not.toContain(">Approve<");
    expect(markup).not.toContain(">Decline<");
  });
});
