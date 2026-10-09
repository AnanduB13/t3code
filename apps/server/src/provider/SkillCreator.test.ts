import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { ProviderDriverKind, ProviderInstanceId, SkillName } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import {
  createGlobalSkill,
  createProjectSkill,
  readSkillDocument,
  updateSkillDocument,
} from "./SkillCreator.ts";

const TestLayer = Layer.empty.pipe(
  Layer.provideMerge(WorkspacePaths.layer),
  Layer.provideMerge(NodeServices.layer),
);

it.layer(TestLayer)("createProjectSkill", (it) => {
  const input = {
    cwd: "",
    instanceId: ProviderInstanceId.make("codex"),
    name: SkillName.make("review-code"),
    description: "Review code for correctness.",
    instructions: "Inspect the changes and report actionable findings.",
  };

  it.effect("creates a valid Codex project skill", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-skill-creator-" });

      const result = yield* createProjectSkill({ ...input, cwd }, ProviderDriverKind.make("codex"));
      const contents = yield* fileSystem.readFileString(
        path.join(cwd, ".agents", "skills", "review-code", "SKILL.md"),
      );

      expect(result.skill).toMatchObject({
        name: "review-code",
        description: "Review code for correctness.",
        scope: "project",
        enabled: true,
      });
      expect(contents).toContain("name: review-code");
      expect(contents).toContain('description: "Review code for correctness."');
      expect(contents).toContain("Inspect the changes and report actionable findings.");
    }),
  );

  it.effect("uses Claude's project skill location", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-skill-creator-" });

      yield* createProjectSkill({ ...input, cwd }, ProviderDriverKind.make("claudeAgent"));

      expect(
        yield* fileSystem.exists(path.join(cwd, ".claude", "skills", "review-code", "SKILL.md")),
      ).toBe(true);
    }),
  );

  it.effect("refuses to overwrite an existing skill", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-skill-creator-" });
      const request = { ...input, cwd };

      yield* createProjectSkill(request, ProviderDriverKind.make("codex"));
      const error = yield* createProjectSkill(request, ProviderDriverKind.make("codex")).pipe(
        Effect.flip,
      );

      expect(error.failure).toBe("already_exists");
    }),
  );

  describe("unsupported providers", () => {
    it.effect("returns a useful error", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-skill-creator-" });

        const error = yield* createProjectSkill(
          { ...input, cwd },
          ProviderDriverKind.make("opencode"),
        ).pipe(Effect.flip);

        expect(error.failure).toBe("provider_not_supported");
      }),
    );
  });
});

it.layer(NodeServices.layer)("global skill management", (it) => {
  const driver = ProviderDriverKind.make("codex");
  const instanceId = ProviderInstanceId.make("codex-work");

  it.effect("creates, reads, and updates a user-owned global skill", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const homePath = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-global-skill-" });
      const instance = { driver, config: { homePath } };
      const created = yield* createGlobalSkill(
        {
          instanceId,
          name: SkillName.make("review-code"),
          description: "Review code for correctness.",
          instructions: "Inspect every relevant change.",
        },
        driver,
        instance,
      );

      const initial = yield* readSkillDocument(
        { instanceId, path: created.skill.path },
        driver,
        [created.skill],
        instance,
      );
      expect(initial.editable).toBe(true);

      const content = initial.content.replace(
        "Review code for correctness.",
        "Review code carefully.",
      );
      const updated = yield* updateSkillDocument(
        { instanceId, path: created.skill.path, content },
        driver,
        [created.skill],
        instance,
      );

      expect(updated.skill.description).toBe("Review code carefully.");
      expect(yield* fileSystem.readFileString(created.skill.path)).toBe(content);
      expect(created.skill.path).toBe(path.join(homePath, "skills", "review-code", "SKILL.md"));
    }),
  );

  it.effect("keeps project skills read-only in global settings", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const homePath = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-global-skill-" });
      const projectRoot = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-project-skill-",
      });
      const skillPath = path.join(projectRoot, ".agents", "skills", "review-code", "SKILL.md");
      yield* fileSystem.makeDirectory(path.dirname(skillPath), { recursive: true });
      yield* fileSystem.writeFileString(
        skillPath,
        "---\nname: review-code\ndescription: Review code.\n---\n\nDo the review.\n",
      );
      const skill = {
        name: "review-code",
        description: "Review code.",
        path: skillPath,
        scope: "project",
        enabled: true,
      };
      const read = yield* readSkillDocument({ instanceId, path: skillPath }, driver, [skill], {
        driver,
        config: { homePath },
      });
      expect(read.editable).toBe(false);
    }),
  );

  it.effect("rejects edits that rename the skill in frontmatter", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const homePath = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-global-skill-" });
      const instance = { driver, config: { homePath } };
      const created = yield* createGlobalSkill(
        {
          instanceId,
          name: SkillName.make("review-code"),
          description: "Review code.",
          instructions: "Do the review.",
        },
        driver,
        instance,
      );
      const error = yield* updateSkillDocument(
        {
          instanceId,
          path: created.skill.path,
          content: "---\nname: renamed\ndescription: Review code.\n---\n\nDo the review.\n",
        },
        driver,
        [created.skill],
        instance,
      ).pipe(Effect.flip);

      expect(error.failure).toBe("invalid_content");
    }),
  );
});
