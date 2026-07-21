import { ApprovalRequestId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ComposerPendingApprovalPanel } from "./ComposerPendingApprovalPanel";

describe("ComposerPendingApprovalPanel", () => {
  it("renders complete multiline command details without hover or truncation", () => {
    const detail = `bun run release -- ${"long-argument ".repeat(20)}\nsecond line`;
    const markup = renderToStaticMarkup(
      <ComposerPendingApprovalPanel
        approval={{
          requestId: ApprovalRequestId.make("approval-1"),
          requestKind: "command",
          createdAt: "2026-07-18T00:00:00.000Z",
          detail,
        }}
        pendingCount={1}
      />,
    );

    expect(markup).toContain('data-approval-detail="complete"');
    expect(markup).toContain('aria-label="Command"');
    expect(markup).toContain(detail);
    expect(markup).not.toContain("truncate");
    expect(markup).not.toContain("line-clamp");
  });

  it("labels Computer Use requests and proposed actions explicitly", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingApprovalPanel
        approval={{
          requestId: ApprovalRequestId.make("computer-approval-1"),
          requestKind: "computer-use",
          createdAt: "2026-07-21T00:00:00.000Z",
          detail: "Allow Computer Use to click Save?",
        }}
        pendingCount={1}
      />,
    );

    expect(markup).toContain("Computer Use approval requested");
    expect(markup).toContain('aria-label="Proposed action"');
  });
});
