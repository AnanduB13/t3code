import type { ServerProviderSkill } from "@t3tools/contracts";

function titleCaseWords(value: string): string {
  return value
    .split(/[\s:_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatProviderSkillDisplayName(
  skill: Pick<ServerProviderSkill, "name" | "displayName">,
): string {
  return skill.displayName?.trim() || titleCaseWords(skill.name);
}

export function formatProviderSkillInstallSource(
  skill: Pick<ServerProviderSkill, "path" | "scope">,
): string | null {
  const normalizedPath = skill.path.replaceAll("\\", "/");
  if (normalizedPath.includes("/.codex/plugins/") || normalizedPath.includes("/.agents/plugins/")) {
    return "App";
  }

  const scope = skill.scope?.trim().toLowerCase();
  if (scope === "system") return "System";
  if (scope === "project" || scope === "workspace" || scope === "local") return "Project";
  if (scope === "user" || scope === "personal") return "Personal";
  return scope ? titleCaseWords(scope) : null;
}
