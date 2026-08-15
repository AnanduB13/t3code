import {
  ProviderDriverKind,
  SkillCreateError,
  type SkillCreateInput,
  type SkillCreateResult,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";

const CODEX_SKILL_ROOT = ".agents/skills";
const CLAUDE_SKILL_ROOT = ".claude/skills";

function projectSkillRoot(provider: ProviderDriverKind): string | null {
  if (provider === ProviderDriverKind.make("codex")) return CODEX_SKILL_ROOT;
  if (provider === ProviderDriverKind.make("claude")) return CLAUDE_SKILL_ROOT;
  return null;
}

function skillMarkdown(input: SkillCreateInput): string {
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
