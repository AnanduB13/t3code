import type { UsageProviderKind, UsageSource } from "@t3tools/contracts";
import { msg } from "gt-react";

import { m, type MessageResolver } from "~/i18n/messages";

const SOURCE_LABEL: Record<UsageProviderKind, string> = {
  codex: "Codex",
  claude: "Claude Code",
  grok: "Grok",
  cursor: "Cursor",
  opencode: "OpenCode",
  antigravity: "Antigravity",
  pi: "Pi",
  muse: "Muse",
};

export function describeUsageSources(
  sources: readonly UsageSource[],
  resolve: MessageResolver = m,
): string {
  if (sources.length === 0) return resolve(msg("No local CLI histories reported"));
  return sources
    .map((source) => {
      const label = SOURCE_LABEL[source.fingerprint.provider];
      if (source.status === "missing") return resolve(msg("{label} not found", { label }));
      if (source.status === "failed") return resolve(msg("{label} unavailable", { label }));
      const variables = {
        label,
        count: source.distinctSessions,
        sessions: source.distinctSessions.toLocaleString(),
      };
      return source.status === "partial"
        ? resolve(
            msg(
              "{count, plural, one {{label} {sessions} session (partial)} other {{label} {sessions} sessions (partial)}}",
              variables,
            ),
          )
        : resolve(
            msg(
              "{count, plural, one {{label} {sessions} session} other {{label} {sessions} sessions}}",
              variables,
            ),
          );
    })
    .join(" · ");
}
