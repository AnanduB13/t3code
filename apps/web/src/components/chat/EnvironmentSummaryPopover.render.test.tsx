import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { EnvironmentSummaryWidget } from "./EnvironmentSummaryPopover";

function ProviderIcon({ className }: { className?: string }) {
  return <svg className={className} />;
}

describe("EnvironmentSummaryWidget", () => {
  it("stays closed when mounted for a newly selected chat", () => {
    const markup = renderToStaticMarkup(
      <EnvironmentSummaryWidget
        threadRef={null}
        status={null}
        workspaceLabel="Local checkout"
        workspaceDetail="/workspace/project"
        providerName="GitHub"
        ProviderIcon={ProviderIcon}
        quickActionLabel="Commit, push & PR"
        quickActionDisabled={false}
        refreshing={false}
        onRefresh={() => undefined}
        onOpenChanges={() => undefined}
        onRunQuickAction={() => undefined}
        onOpenPullRequest={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Show environment details"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("Workspace, hosts, and source control");
  });
});
