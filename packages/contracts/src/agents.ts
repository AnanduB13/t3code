import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const HermesAgentStatus = Schema.Struct({
  available: Schema.Boolean,
  endpoint: Schema.String,
  version: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  timezone: Schema.optional(Schema.String),
});
export type HermesAgentStatus = typeof HermesAgentStatus.Type;

export const HermesSession = Schema.Struct({
  id: TrimmedNonEmptyString,
  title: Schema.NullOr(Schema.String),
  model: Schema.NullOr(Schema.String),
  source: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Schema.String),
  lastActive: Schema.NullOr(Schema.String),
  messageCount: Schema.Number,
  parentSessionId: Schema.NullOr(Schema.String),
  cronJobId: Schema.NullOr(Schema.String),
});
export type HermesSession = typeof HermesSession.Type;

export const HermesMessage = Schema.Struct({
  id: Schema.String,
  role: Schema.String,
  content: Schema.String,
  timestamp: Schema.NullOr(Schema.String),
  toolName: Schema.NullOr(Schema.String),
  reasoning: Schema.NullOr(Schema.String),
});
export type HermesMessage = typeof HermesMessage.Type;

export const HermesSessionList = Schema.Struct({
  sessions: Schema.Array(HermesSession),
  hasMore: Schema.Boolean,
});

export const HermesCronJob = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: Schema.String,
  prompt: Schema.String,
  schedule: Schema.optional(Schema.NullOr(Schema.String)),
  scheduleDisplay: Schema.NullOr(Schema.String),
  workdir: Schema.optional(Schema.NullOr(Schema.String)),
  delivery: Schema.optional(Schema.NullOr(Schema.String)),
  enabled: Schema.Boolean,
  state: Schema.String,
  nextRunAt: Schema.NullOr(Schema.String),
  lastRunAt: Schema.NullOr(Schema.String),
  lastStatus: Schema.NullOr(Schema.String),
  completedRuns: Schema.Number,
});
export type HermesCronJob = typeof HermesCronJob.Type;

export const HermesCronJobList = Schema.Struct({
  jobs: Schema.Array(HermesCronJob),
});

export const HermesCronRun = Schema.Struct({
  sessionId: TrimmedNonEmptyString,
  title: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Schema.String),
  completedAt: Schema.NullOr(Schema.String),
  response: Schema.NullOr(Schema.String),
  responseAt: Schema.NullOr(Schema.String),
});
export type HermesCronRun = typeof HermesCronRun.Type;

export const HermesCronRunListInput = Schema.Struct({
  jobId: TrimmedNonEmptyString,
  limit: Schema.Number,
});

export const HermesCronRunList = Schema.Struct({
  jobId: TrimmedNonEmptyString,
  runs: Schema.Array(HermesCronRun),
  total: Schema.Number,
  hasMore: Schema.Boolean,
});

export const HermesCreateCronJobInput = Schema.Struct({
  name: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  schedule: TrimmedNonEmptyString,
  workdir: Schema.optional(TrimmedNonEmptyString),
});

export const HermesUpdateCronJobInput = Schema.Struct({
  jobId: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  schedule: TrimmedNonEmptyString,
  workdir: Schema.optional(Schema.String),
});

export const HermesCronJobIdInput = Schema.Struct({ jobId: TrimmedNonEmptyString });

export const HermesDeleteCronJobResult = Schema.Struct({
  jobId: TrimmedNonEmptyString,
  deleted: Schema.Boolean,
});

export const HermesMessageList = Schema.Struct({
  sessionId: TrimmedNonEmptyString,
  messages: Schema.Array(HermesMessage),
});

export const HermesSessionIdInput = Schema.Struct({ sessionId: TrimmedNonEmptyString });
export const HermesCreateSessionInput = Schema.Struct({
  title: Schema.optional(Schema.String),
});
export const HermesUpdateSessionInput = Schema.Struct({
  sessionId: TrimmedNonEmptyString,
  title: Schema.String,
});
export const HermesForkSessionInput = Schema.Struct({
  sessionId: TrimmedNonEmptyString,
  title: Schema.optional(Schema.String),
});
export const HermesSendMessageInput = Schema.Struct({
  sessionId: TrimmedNonEmptyString,
  message: TrimmedNonEmptyString,
});

export const HermesSendMessageResult = Schema.Struct({
  sessionId: TrimmedNonEmptyString,
  message: HermesMessage,
});

export const HermesDeleteSessionResult = Schema.Struct({
  sessionId: TrimmedNonEmptyString,
  deleted: Schema.Boolean,
});

export class HermesAgentError extends Schema.TaggedErrorClass<HermesAgentError>()(
  "HermesAgentError",
  {
    operation: Schema.String,
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}
