import type { ServerProviderSkill } from "@t3tools/contracts";
import { msg } from "gt-react";

import { m, type MessageResolver } from "~/i18n/messages";

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
  resolve: MessageResolver = m,
): string | null {
  const normalizedPath = skill.path.replaceAll("\\", "/");
  if (normalizedPath.includes("/.codex/plugins/") || normalizedPath.includes("/.agents/plugins/")) {
    return resolve(msg("App", { $context: "skill install source" }));
  }

  const scope = skill.scope?.trim().toLowerCase();
  if (scope === "system") return resolve(msg("System", { $context: "skill install source" }));
  if (scope === "project" || scope === "workspace" || scope === "local") {
    return resolve(msg("Project", { $context: "skill install source" }));
  }
  if (scope === "user" || scope === "personal") {
    return resolve(msg("Personal", { $context: "skill install source" }));
  }
  return scope ? titleCaseWords(scope) : null;
}
