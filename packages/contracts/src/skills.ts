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

export const SkillCreateGlobalInput = Schema.Struct({
  instanceId: ProviderInstanceId,
  name: SkillName,
  description: TrimmedNonEmptyString.check(Schema.isMaxLength(1_000)),
  instructions: TrimmedNonEmptyString.check(Schema.isMaxLength(50_000)),
});
export type SkillCreateGlobalInput = typeof SkillCreateGlobalInput.Type;

export const SkillDocumentInput = Schema.Struct({
  instanceId: ProviderInstanceId,
  path: TrimmedNonEmptyString,
});
export type SkillDocumentInput = typeof SkillDocumentInput.Type;

export const SkillDocumentResult = Schema.Struct({
  skill: ServerProviderSkill,
  content: Schema.String,
  editable: Schema.Boolean,
});
export type SkillDocumentResult = typeof SkillDocumentResult.Type;

export const SkillUpdateInput = Schema.Struct({
  instanceId: ProviderInstanceId,
  path: TrimmedNonEmptyString,
  content: TrimmedNonEmptyString.check(Schema.isMaxLength(100_000)),
});
export type SkillUpdateInput = typeof SkillUpdateInput.Type;

export const SkillUpdateResult = Schema.Struct({
  skill: ServerProviderSkill,
});
export type SkillUpdateResult = typeof SkillUpdateResult.Type;

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

export const SkillDocumentFailure = Schema.Literals([
  "provider_not_found",
  "skill_not_found",
  "not_editable",
  "invalid_content",
  "read_failed",
  "write_failed",
]);
export type SkillDocumentFailure = typeof SkillDocumentFailure.Type;

export class SkillDocumentError extends Schema.TaggedErrorClass<SkillDocumentError>()(
  "SkillDocumentError",
  {
    failure: SkillDocumentFailure,
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect()),
  },
) {}
