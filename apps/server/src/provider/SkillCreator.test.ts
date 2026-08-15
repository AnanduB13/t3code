import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { ProviderDriverKind, ProviderInstanceId, SkillName } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import { createProjectSkill } from "./SkillCreator.ts";

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

      yield* createProjectSkill({ ...input, cwd }, ProviderDriverKind.make("claude"));

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
