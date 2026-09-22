import type {
  PullRequestDetail,
  PullRequestReviewPosition,
  PullRequestReviewVerdict,
} from "@t3tools/contracts";
import { buildReviewParsedDiff } from "../review/reviewModel";

export function availableReviewVerdicts(
  detail: Pick<PullRequestDetail, "state" | "capabilities" | "viewerPermissions">,
): readonly PullRequestReviewVerdict[] {
  if (detail.state !== "open") return [];
  return detail.capabilities.review.verdicts.filter((verdict) =>
    detail.viewerPermissions.verdicts.includes(verdict),
  );
}

export function canSubmitReview(
  verdict: PullRequestReviewVerdict,
  body: string,
  commentCount: number,
) {
  return verdict === "approve" || body.trim().length > 0 || commentCount > 0;
}

export interface PullRequestDiffLine {
  readonly text: string;
  readonly position: PullRequestReviewPosition | null;
}

/** Keep both sides' coordinates, including renames, for host-backed inline comments. */
export function parseReviewPatch(patch: string) {
  const parsed = buildReviewParsedDiff(patch, "pull-request");
  if (parsed.kind === "empty") return [];
  if (parsed.kind === "raw") throw new Error(parsed.reason);
  return parsed.files.map((file) => ({
    id: file.id,
    path: file.path,
    ...(file.previousPath && file.previousPath !== file.path ? { oldPath: file.previousPath } : {}),
    lines: file.rows.map((row): PullRequestDiffLine & { readonly id: string } => {
      if (row.kind === "hunk") return { id: row.id, text: row.header, position: null };
      const position: PullRequestReviewPosition | null =
        row.change === "add" && row.newLineNumber !== null
          ? { kind: "added", newLine: row.newLineNumber }
          : row.change === "delete" && row.oldLineNumber !== null
            ? { kind: "deleted", oldLine: row.oldLineNumber }
            : row.oldLineNumber !== null && row.newLineNumber !== null
              ? {
                  kind: "context",
                  oldLine: row.oldLineNumber,
                  newLine: row.newLineNumber,
                  side: "right",
                }
              : null;
      return {
        id: row.id,
        text: `${row.change === "add" ? "+" : row.change === "delete" ? "-" : " "}${row.content}`,
        position,
      };
    }),
  }));
}

export function canEditPullRequest(
  detail: Pick<PullRequestDetail, "capabilities" | "viewer" | "author" | "viewerPermissions">,
) {
  return (
    detail.capabilities.edit?.changeRequest === true &&
    ((Boolean(detail.viewer?.trim()) &&
      detail.viewer?.trim().toLowerCase() === detail.author?.login.trim().toLowerCase()) ||
      detail.viewerPermissions.actions.includes("merge"))
  );
}
