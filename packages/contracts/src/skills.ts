import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";
import { ServerProviderSkill } from "./server.ts";

export const SkillName = TrimmedNonEmptyString.check(
  Schema.isMaxLength(64),
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
);
export type SkillName = typeof SkillName.Type;

export const SkillCreateInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  instanceId: ProviderInstanceId,
  name: SkillName,
  description: TrimmedNonEmptyString.check(Schema.isMaxLength(1_000)),
  instructions: TrimmedNonEmptyString.check(Schema.isMaxLength(50_000)),
});
export type SkillCreateInput = typeof SkillCreateInput.Type;

export const SkillCreateResult = Schema.Struct({
  skill: ServerProviderSkill,
});
export type SkillCreateResult = typeof SkillCreateResult.Type;

export const SkillCreateFailure = Schema.Literals([
  "provider_not_found",
  "provider_not_supported",
  "already_exists",
  "workspace_invalid",
  "write_failed",
]);
export type SkillCreateFailure = typeof SkillCreateFailure.Type;

export class SkillCreateError extends Schema.TaggedErrorClass<SkillCreateError>()(
  "SkillCreateError",
  {
    failure: SkillCreateFailure,
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect()),
  },
) {}
