import type { UsageSource } from "@t3tools/contracts";

const SOURCE_LABEL = {
  codex: "Codex",
  claude: "Claude Code",
  grok: "Grok",
} as const;

export function describeUsageSources(sources: readonly UsageSource[]): string {
  if (sources.length === 0) return "No local CLI histories reported";
  return sources
    .map((source) => {
      const label = SOURCE_LABEL[source.fingerprint.provider];
      if (source.status === "missing") return `${label} not found`;
      if (source.status === "failed") return `${label} unavailable`;
      const sessions = `${source.distinctSessions.toLocaleString()} ${source.distinctSessions === 1 ? "session" : "sessions"}`;
      return source.status === "partial"
        ? `${label} ${sessions} (partial)`
        : `${label} ${sessions}`;
    })
    .join(" · ");
}
