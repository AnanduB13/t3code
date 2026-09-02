import { EnvironmentId, ProjectId, type PullRequestListEntry } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { PullRequestRow } from "./PullRequestRow";

const entry = {
  environmentId: EnvironmentId.make("environment-1"),
  provider: "github",
  host: "github.com",
  projectId: ProjectId.make("project-1"),
  projectTitle: "Payments Dashboard",
  repository: "acme/web",
  number: 42,
  title: "Improve checkout",
  url: "https://github.com/acme/web/pull/42",
  author: { login: "octocat", name: null, avatarUrl: null },
  headBranch: "feat/checkout",
  baseBranch: "main",
  state: "open",
  isDraft: false,
  mergeability: "mergeable",
  additions: 12,
  deletions: 3,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-02T00:00:00Z",
  viewerReviewRequested: false,
  labels: [],
} as PullRequestListEntry & { environmentId: EnvironmentId };

describe("PullRequestRow", () => {
  it("shows both the local project and repository identities", () => {
    const markup = renderToStaticMarkup(
      <PullRequestRow
        entry={entry}
        selected={false}
        showProjectTitle
        showProvider={false}
        onSelect={() => undefined}
      />,
    );

    expect(markup).toContain("Payments Dashboard");
    expect(markup).toContain("Project: Payments Dashboard");
    expect(markup).toContain("acme/web");
  });
});
