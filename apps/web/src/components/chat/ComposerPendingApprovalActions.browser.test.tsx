import { RuntimeRequestId, type ProviderApprovalOption } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";

async function renderActions(options?: ReadonlyArray<ProviderApprovalOption>) {
  const onRespond = vi.fn(async () => undefined);
  const screen = await render(
    <ComposerPendingApprovalActions
      requestId={RuntimeRequestId.make("approval-1")}
      canRespond
      isResponding={false}
      options={options}
      onRespondToApproval={onRespond}
    />,
  );
  const { container } = screen;
  return {
    onRespond,
    container,
    rowLabels: () =>
      [...container.querySelectorAll("button")]
        .map((button) => button.textContent?.trim())
        .filter(Boolean),
    openMore: async () => {
      await act(async () =>
        container.querySelector<HTMLElement>('[aria-label="More approval options"]')!.click(),
      );
      return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    },
    [Symbol.asyncDispose]: () => screen[Symbol.asyncDispose](),
  };
}

describe("ComposerPendingApprovalActions", () => {
  it("keeps the main decisions in the row and sends a secondary decision from the menu", async () => {
    await using screen = await renderActions();
    const { onRespond, rowLabels, openMore } = screen;
    expect(rowLabels()).toEqual(["Decline", "Approve"]);

    const items = await openMore();
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      "Cancel",
      "Always allow this session",
    ]);
    await act(async () => items[1]!.click());
    expect(onRespond).toHaveBeenCalledWith(RuntimeRequestId.make("approval-1"), "acceptForSession");
  });

  it("keeps provider labels, including secondary ones, where the user can find them", async () => {
    await using screen = await renderActions([
      { decision: "decline", label: "Deny" },
      { decision: "acceptAlways", label: "Always allow Safari" },
      { decision: "accept", label: "Allow once" },
    ]);
    const { container, onRespond, rowLabels, openMore } = screen;
    expect(rowLabels()).toEqual(["Deny", "Allow once"]);
    expect((await openMore()).map((item) => item.textContent?.trim())).toEqual([
      "Always allow Safari",
    ]);

    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Allow once")!
        .click(),
    );
    expect(onRespond).toHaveBeenCalledWith(RuntimeRequestId.make("approval-1"), "accept");
  });

  it("shows the provider warning when opening secondary approval choices", async () => {
    await using screen = await renderActions([
      { decision: "accept", label: "Allow once" },
      {
        decision: "acceptForSession",
        label: "Allow for this thread",
        warning: "Untrusted files could re-run this action without asking.",
      },
      { decision: "decline", label: "Deny" },
    ]);
    await screen.openMore();
    const choice = document.querySelector<HTMLElement>('[role="menuitem"][aria-description]')!;
    expect(choice.textContent).toContain("Allow for this thread");
    expect(choice.getAttribute("aria-description")).toBe(
      "Untrusted files could re-run this action without asking.",
    );
    await act(async () => choice.click());
    expect(screen.onRespond).toHaveBeenCalledWith(
      RuntimeRequestId.make("approval-1"),
      "acceptForSession",
    );
  });
});
