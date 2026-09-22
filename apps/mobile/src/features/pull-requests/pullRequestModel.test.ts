import { describe, expect, it } from "vite-plus/test";
import type { PullRequestDetail } from "@t3tools/contracts";
import {
  availableReviewVerdicts,
  canEditPullRequest,
  canSubmitReview,
  parseReviewPatch,
} from "./pullRequestModel";

const capabilities: PullRequestDetail["capabilities"] = {
  diff: true,
  comment: true,
  actions: ["merge"],
  mergeMethods: ["squash"],
  search: true,
  review: {
    inlineComment: true,
    reply: true,
    resolve: true,
    verdicts: ["comment", "approve", "request-changes"],
  },
  reviewers: { request: true, listCandidates: true },
  edit: { changeRequest: true, comment: true },
};
const viewerPermissions: PullRequestDetail["viewerPermissions"] = {
  actions: [],
  comment: true,
  resolve: true,
  verdicts: ["comment", "request-changes"],
  requestReviewers: true,
};

describe("mobile PR review permissions", () => {
  it("intersects host capabilities with viewer permissions and excludes closed PRs", () => {
    const detail = { state: "open" as const, capabilities, viewerPermissions };
    expect(availableReviewVerdicts(detail)).toEqual(["comment", "request-changes"]);
    expect(availableReviewVerdicts({ ...detail, state: "merged" })).toEqual([]);
    expect(
      availableReviewVerdicts({
        ...detail,
        capabilities: {
          ...capabilities,
          review: { ...capabilities.review, verdicts: ["approve"] },
        },
      }),
    ).toEqual([]);
  });
  it("allows an empty approval, but requires words or line comments for other verdicts", () => {
    expect(canSubmitReview("approve", "", 0)).toBe(true);
    expect(canSubmitReview("comment", "  ", 0)).toBe(false);
    expect(canSubmitReview("request-changes", "", 0)).toBe(false);
    expect(canSubmitReview("request-changes", "", 1)).toBe(true);
    expect(canSubmitReview("comment", "Please update the test", 0)).toBe(true);
  });
  it("only offers description editing to the author or someone allowed to merge", () => {
    const detail = {
      capabilities,
      viewerPermissions,
      author: { login: "ANANDU", avatarUrl: null, name: null },
      viewer: "anandu",
    };
    expect(canEditPullRequest(detail)).toBe(true);
    expect(canEditPullRequest({ ...detail, viewer: "someone-else" })).toBe(false);
    expect(canEditPullRequest({ ...detail, viewer: undefined })).toBe(false);
    expect(
      canEditPullRequest({
        ...detail,
        viewer: "maintainer",
        viewerPermissions: { ...viewerPermissions, actions: ["merge"] },
      }),
    ).toBe(true);
    expect(
      canEditPullRequest({ ...detail, capabilities: { ...capabilities, edit: undefined } }),
    ).toBe(false);
  });
});

describe("mobile PR diff coordinates", () => {
  it("keeps both line counters across replacements and disjoint hunks", () => {
    const [file] = parseReviewPatch(
      "diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -3,3 +3,4 @@\n context\n-before\n+after\n+extra\n end\n@@ -20,1 +21,1 @@\n-old\n+new\n",
    );
    expect(file?.path).toBe("file.ts");
    expect(file?.lines.filter((line) => line.position).map((line) => line.position)).toEqual([
      { kind: "context", oldLine: 3, newLine: 3, side: "right" },
      { kind: "deleted", oldLine: 4 },
      { kind: "added", newLine: 4 },
      { kind: "added", newLine: 5 },
      { kind: "context", oldLine: 5, newLine: 6, side: "right" },
      { kind: "deleted", oldLine: 20 },
      { kind: "added", newLine: 21 },
    ]);
  });
  it("preserves the old path for renamed files", () => {
    const [file] = parseReviewPatch(
      "diff --git a/old.ts b/new.ts\nsimilarity index 50%\nrename from old.ts\nrename to new.ts\n--- a/old.ts\n+++ b/new.ts\n@@ -1 +1 @@\n-old\n+new\n",
    );
    expect(file).toMatchObject({ path: "new.ts", oldPath: "old.ts" });
  });
  it("uses the deleted path and never treats a no-newline marker as a commentable line", () => {
    const [file] = parseReviewPatch(
      "diff --git a/gone.ts b/gone.ts\n--- a/gone.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n\\ No newline at end of file\n",
    );
    expect(file?.path).toBe("gone.ts");
    expect(file?.lines.filter((line) => line.position).map((line) => line.position)).toEqual([
      { kind: "deleted", oldLine: 1 },
    ]);
  });
  it("does not attach /dev/null as an old path for new files", () => {
    const [file] = parseReviewPatch(
      "diff --git a/new.ts b/new.ts\n--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1 @@\n+new\n",
    );
    expect(file?.oldPath).toBeUndefined();
    expect(file?.lines.at(-1)?.position).toEqual({ kind: "added", newLine: 1 });
  });
  it("handles an empty diff", () => {
    expect(parseReviewPatch("")).toEqual([]);
  });
});
