import * as NodeOS from "node:os";

import {
  ProviderDriverKind,
  SkillCreateError,
  SkillDocumentError,
  type ProviderInstanceConfig,
  type ServerProviderSkill,
  type SkillCreateGlobalInput,
  type SkillCreateInput,
  type SkillCreateResult,
  type SkillDocumentInput,
  type SkillDocumentResult,
  type SkillUpdateInput,
  type SkillUpdateResult,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { parse as parseYamlDocument } from "yaml";

import { writeFileStringAtomically } from "../atomicWrite.ts";
import { expandHomePath } from "../pathExpansion.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";

const CODEX_SKILL_ROOT = ".agents/skills";
const CLAUDE_SKILL_ROOT = ".claude/skills";

function projectSkillRoot(provider: ProviderDriverKind): string | null {
  if (provider === ProviderDriverKind.make("codex")) return CODEX_SKILL_ROOT;
  if (
    provider === ProviderDriverKind.make("claudeAgent") ||
    provider === ProviderDriverKind.make("claude")
  ) {
    return CLAUDE_SKILL_ROOT;
  }
  return null;
}

function skillMarkdown(input: {
  readonly name: string;
  readonly description: string;
  readonly instructions: string;
}): string {
  return [
    "---",
    `name: ${input.name}`,
    `description: ${JSON.stringify(input.description)}`,
    "---",
    "",
    `# ${input.name}`,
    "",
    input.instructions.trim(),
    "",
  ].join("\n");
}

function configString(instance: ProviderInstanceConfig | undefined, key: string): string {
  if (typeof instance?.config !== "object" || instance.config === null) return "";
  const value = (instance.config as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function environmentValue(instance: ProviderInstanceConfig | undefined, name: string): string {
  return instance?.environment?.find((entry) => entry.name === name)?.value.trim() ?? "";
}

const resolveUserSkillRoot = Effect.fn("resolveUserSkillRoot")(function* (
  provider: ProviderDriverKind,
  instance?: ProviderInstanceConfig,
): Effect.fn.Return<string | null, never, Path.Path> {
  const path = yield* Path.Path;
  if (provider === ProviderDriverKind.make("codex")) {
    const configuredHome =
      configString(instance, "homePath") ||
      environmentValue(instance, "CODEX_HOME") ||
      process.env.CODEX_HOME?.trim() ||
      path.join(NodeOS.homedir(), ".codex");
    return path.join(path.resolve(expandHomePath(configuredHome)), "skills");
  }
  if (
    provider === ProviderDriverKind.make("claudeAgent") ||
    provider === ProviderDriverKind.make("claude")
  ) {
    const configuredHome =
      configString(instance, "homePath") ||
      environmentValue(instance, "CLAUDE_CONFIG_DIR") ||
      process.env.CLAUDE_CONFIG_DIR?.trim() ||
      path.join(NodeOS.homedir(), ".claude");
    return path.join(path.resolve(expandHomePath(configuredHome)), "skills");
  }
  return null;
});

function findRegisteredSkill(
  input: SkillDocumentInput,
  skills: ReadonlyArray<ServerProviderSkill>,
): ServerProviderSkill | null {
  return skills.find((skill) => skill.path === input.path) ?? null;
}

const isEditableUserSkill = Effect.fn("isEditableUserSkill")(function* (
  skill: ServerProviderSkill,
  provider: ProviderDriverKind,
  instance?: ProviderInstanceConfig,
): Effect.fn.Return<boolean, never, FileSystem.FileSystem | Path.Path> {
  if (skill.scope !== "user") return false;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* resolveUserSkillRoot(provider, instance);
  if (!root) return false;
  const canonical = yield* Effect.all([
    fileSystem.realPath(root),
    fileSystem.realPath(skill.path),
  ]).pipe(Effect.option);
  if (canonical._tag === "None") return false;
  const [canonicalRoot, canonicalSkill] = canonical.value;
  return path.relative(canonicalRoot, canonicalSkill) === path.join(skill.name, "SKILL.md");
});

function parseSkillDocument(content: string, expectedName: string): { description: string } | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = parseYamlDocument(match[1] ?? "");
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const frontmatter = parsed as Record<string, unknown>;
  const name = typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
  const description =
    typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";
  if (name !== expectedName || !description) return null;
  return { description };
}

export const createProjectSkill = Effect.fn("createProjectSkill")(function* (
  input: SkillCreateInput,
  provider: ProviderDriverKind,
): Effect.fn.Return<
  SkillCreateResult,
  SkillCreateError,
  FileSystem.FileSystem | Path.Path | WorkspacePaths.WorkspacePaths
> {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspacePaths = yield* WorkspacePaths.WorkspacePaths;
  const root = projectSkillRoot(provider);
  if (!root) {
    return yield* new SkillCreateError({
      failure: "provider_not_supported",
      message: "New skills can currently be created for Codex and Claude.",
    });
  }

  const cwd = yield* workspacePaths.normalizeWorkspaceRoot(input.cwd).pipe(
    Effect.mapError(
      (cause) =>
        new SkillCreateError({
          failure: "workspace_invalid",
          message: "The project folder is unavailable.",
          cause,
        }),
    ),
  );
  const relativeDirectory = `${root}/${input.name}`;
  const target = yield* workspacePaths
    .resolveRelativePathWithinRoot({ workspaceRoot: cwd, relativePath: relativeDirectory })
    .pipe(
      Effect.mapError(
        (cause) =>
          new SkillCreateError({
            failure: "workspace_invalid",
            message: "The skill path is outside the project folder.",
            cause,
          }),
      ),
    );

  yield* fileSystem.makeDirectory(path.dirname(target.absolutePath), { recursive: true }).pipe(
    Effect.mapError(
      (cause) =>
        new SkillCreateError({
          failure: "write_failed",
          message: "Could not prepare the project skills folder.",
          cause,
        }),
    ),
  );
  yield* fileSystem.makeDirectory(target.absolutePath).pipe(
    Effect.mapError(
      (cause) =>
        new SkillCreateError({
          failure: cause.reason._tag === "AlreadyExists" ? "already_exists" : "write_failed",
          message:
            cause.reason._tag === "AlreadyExists"
              ? `A skill named '${input.name}' already exists in this project.`
              : "Could not create the skill folder.",
          cause,
        }),
    ),
  );

  const skillPath = path.join(target.absolutePath, "SKILL.md");
  yield* fileSystem.writeFileString(skillPath, skillMarkdown(input)).pipe(
    Effect.mapError(
      (cause) =>
        new SkillCreateError({
          failure: "write_failed",
          message: "Could not write the skill instructions.",
          cause,
        }),
    ),
    Effect.tapError(() =>
      fileSystem.remove(target.absolutePath, { recursive: true, force: true }).pipe(Effect.ignore),
    ),
  );

  return {
    skill: {
      name: input.name,
      description: input.description,
      path: skillPath,
      scope: "project",
      enabled: true,
    },
  };
});

export const createGlobalSkill = Effect.fn("createGlobalSkill")(function* (
  input: SkillCreateGlobalInput,
  provider: ProviderDriverKind,
  instance?: ProviderInstanceConfig,
): Effect.fn.Return<SkillCreateResult, SkillCreateError, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* resolveUserSkillRoot(provider, instance);
  if (!root) {
    return yield* new SkillCreateError({
      failure: "provider_not_supported",
      message: "Global skills can currently be created for Codex and Claude.",
    });
  }
  yield* fileSystem.makeDirectory(root, { recursive: true }).pipe(
    Effect.mapError(
      (cause) =>
        new SkillCreateError({
          failure: "write_failed",
          message: "Could not prepare the global skills folder.",
          cause,
        }),
    ),
  );
  const targetDirectory = path.join(root, input.name);
  yield* fileSystem.makeDirectory(targetDirectory).pipe(
    Effect.mapError(
      (cause) =>
        new SkillCreateError({
          failure: cause.reason._tag === "AlreadyExists" ? "already_exists" : "write_failed",
          message:
            cause.reason._tag === "AlreadyExists"
              ? `A global skill named '${input.name}' already exists.`
              : "Could not create the global skill folder.",
          cause,
        }),
    ),
  );
  const skillPath = path.join(targetDirectory, "SKILL.md");
  yield* fileSystem.writeFileString(skillPath, skillMarkdown(input)).pipe(
    Effect.mapError(
      (cause) =>
        new SkillCreateError({
          failure: "write_failed",
          message: "Could not write the global skill instructions.",
          cause,
        }),
    ),
    Effect.tapError(() =>
      fileSystem.remove(targetDirectory, { recursive: true, force: true }).pipe(Effect.ignore),
    ),
  );
  return {
    skill: {
      name: input.name,
      description: input.description,
      path: skillPath,
      scope: "user",
      enabled: true,
    },
  };
});

export const readSkillDocument = Effect.fn("readSkillDocument")(function* (
  input: SkillDocumentInput,
  provider: ProviderDriverKind,
  skills: ReadonlyArray<ServerProviderSkill>,
  instance?: ProviderInstanceConfig,
): Effect.fn.Return<SkillDocumentResult, SkillDocumentError, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem;
  const skill = findRegisteredSkill(input, skills);
  if (!skill) {
    return yield* new SkillDocumentError({
      failure: "skill_not_found",
      message: "This skill is no longer available from the selected provider.",
    });
  }
  const content = yield* fileSystem.readFileString(skill.path).pipe(
    Effect.mapError(
      (cause) =>
        new SkillDocumentError({
          failure: "read_failed",
          message: "Could not read this skill's SKILL.md file.",
          cause,
        }),
    ),
  );
  return {
    skill,
    content,
    editable: yield* isEditableUserSkill(skill, provider, instance),
  };
});

export const updateSkillDocument = Effect.fn("updateSkillDocument")(function* (
  input: SkillUpdateInput,
  provider: ProviderDriverKind,
  skills: ReadonlyArray<ServerProviderSkill>,
  instance?: ProviderInstanceConfig,
): Effect.fn.Return<SkillUpdateResult, SkillDocumentError, FileSystem.FileSystem | Path.Path> {
  const skill = findRegisteredSkill(input, skills);
  if (!skill) {
    return yield* new SkillDocumentError({
      failure: "skill_not_found",
      message: "This skill is no longer available from the selected provider.",
    });
  }
  if (!(yield* isEditableUserSkill(skill, provider, instance))) {
    return yield* new SkillDocumentError({
      failure: "not_editable",
      message: "Built-in, plugin, and project skills are read-only in global Settings.",
    });
  }
  const parsed = parseSkillDocument(input.content, skill.name);
  if (!parsed) {
    return yield* new SkillDocumentError({
      failure: "invalid_content",
      message: `SKILL.md must keep valid YAML frontmatter with name '${skill.name}' and a description.`,
    });
  }
  yield* writeFileStringAtomically({ filePath: skill.path, contents: input.content }).pipe(
    Effect.mapError(
      (cause) =>
        new SkillDocumentError({
          failure: "write_failed",
          message: "Could not save this skill.",
          cause,
        }),
    ),
  );
  return { skill: { ...skill, description: parsed.description } };
});
