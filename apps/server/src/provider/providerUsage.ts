import * as NodeOS from "node:os";

import {
  type ClaudeSettings,
  type CodexSettings,
  type ProviderInstanceId,
  ProviderDriverKind,
  type ProviderUsageSnapshot,
  type ProviderUsageWindow,
} from "@t3tools/contracts";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Scope from "effect/Scope";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as CodexClient from "effect-codex-app-server/client";

import { expandHomePath } from "../pathExpansion.ts";
import { buildCodexInitializeParams } from "./Layers/CodexProvider.ts";
import { codexSessionAppServerArgs } from "./Layers/codexLaunchArgs.ts";
import { resolveClaudeHomePath } from "./Drivers/ClaudeHome.ts";

export interface ProviderUsageReader {
  readonly read: Effect.Effect<ProviderUsageSnapshot>;
}

function boundedPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function isoFromUnixSeconds(value: number | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value * 1_000).toISOString();
}

function usageWindow(input: {
  readonly id: string;
  readonly label: string;
  readonly usedPercent: number;
  readonly resetsAt?: string | null;
  readonly windowDurationMins?: number | null;
}): ProviderUsageWindow {
  const usedPercent = boundedPercent(input.usedPercent);
  return {
    id: input.id,
    label: input.label,
    usedPercent,
    remainingPercent: 100 - usedPercent,
    ...(input.resetsAt !== undefined ? { resetsAt: input.resetsAt as never } : {}),
    ...(input.windowDurationMins !== undefined && input.windowDurationMins !== null
      ? { windowDurationMins: input.windowDurationMins }
      : {}),
  };
}

function codexWindowLabel(
  labelPrefix: string,
  position: "primary" | "secondary",
  windowDurationMins: number | null | undefined,
): string {
  const period =
    windowDurationMins === 10_080
      ? "Weekly"
      : windowDurationMins === 300
        ? "Session"
        : position === "primary"
          ? "Primary limit"
          : "Secondary limit";
  return labelPrefix ? `${labelPrefix} · ${period.toLowerCase()}` : period;
}

function snapshotBase(input: {
  readonly instanceId: ProviderInstanceId;
  readonly displayName: string;
  readonly provider: "codex" | "claudeAgent";
  readonly windows: ReadonlyArray<ProviderUsageWindow>;
  readonly plan?: string | null;
  readonly updatedAt: string;
}): ProviderUsageSnapshot {
  return {
    instanceId: input.instanceId,
    provider: ProviderDriverKind.make(input.provider),
    displayName: input.displayName,
    status: "available",
    windows: input.windows,
    updatedAt: input.updatedAt as ProviderUsageSnapshot["updatedAt"],
    ...(input.plan ? { plan: input.plan } : {}),
  };
}

export function codexUsageSnapshot(input: {
  readonly instanceId: ProviderInstanceId;
  readonly displayName: string;
  readonly response: {
    readonly rateLimits: {
      readonly limitId?: string | null;
      readonly planType?: string | null;
      readonly primary?: {
        readonly usedPercent: number;
        readonly resetsAt?: number | null;
        readonly windowDurationMins?: number | null;
      } | null;
      readonly secondary?: {
        readonly usedPercent: number;
        readonly resetsAt?: number | null;
        readonly windowDurationMins?: number | null;
      } | null;
    };
    readonly rateLimitsByLimitId?: Readonly<
      Record<
        string,
        {
          readonly limitName?: string | null;
          readonly primary?: {
            readonly usedPercent: number;
            readonly resetsAt?: number | null;
            readonly windowDurationMins?: number | null;
          } | null;
          readonly secondary?: {
            readonly usedPercent: number;
            readonly resetsAt?: number | null;
            readonly windowDurationMins?: number | null;
          } | null;
        }
      >
    > | null;
  };
  readonly updatedAt: string;
}): ProviderUsageSnapshot {
  const windows: ProviderUsageWindow[] = [];
  const append = (id: string, labelPrefix: string, value: typeof input.response.rateLimits) => {
    if (value.primary) {
      const resetsAt = isoFromUnixSeconds(value.primary.resetsAt);
      windows.push(
        usageWindow({
          id: `${id}:primary`,
          label: codexWindowLabel(labelPrefix, "primary", value.primary.windowDurationMins),
          usedPercent: value.primary.usedPercent,
          ...(resetsAt !== undefined ? { resetsAt } : {}),
          ...(value.primary.windowDurationMins !== undefined
            ? { windowDurationMins: value.primary.windowDurationMins }
            : {}),
        }),
      );
    }
    if (value.secondary) {
      const resetsAt = isoFromUnixSeconds(value.secondary.resetsAt);
      windows.push(
        usageWindow({
          id: `${id}:secondary`,
          label: codexWindowLabel(labelPrefix, "secondary", value.secondary.windowDurationMins),
          usedPercent: value.secondary.usedPercent,
          ...(resetsAt !== undefined ? { resetsAt } : {}),
          ...(value.secondary.windowDurationMins !== undefined
            ? { windowDurationMins: value.secondary.windowDurationMins }
            : {}),
        }),
      );
    }
  };
  append("default", "", input.response.rateLimits);
  for (const [id, limit] of Object.entries(input.response.rateLimitsByLimitId ?? {})) {
    if (id === input.response.rateLimits.limitId) continue;
    append(id, limit.limitName ?? id, limit);
  }
  return snapshotBase({
    instanceId: input.instanceId,
    displayName: input.displayName,
    provider: "codex",
    windows,
    ...(input.response.rateLimits.planType !== undefined
      ? { plan: input.response.rateLimits.planType }
      : {}),
    updatedAt: input.updatedAt,
  });
}

type ClaudeUsageWindow = {
  readonly utilization?: number | null;
  readonly resets_at?: string | null;
};
type ClaudeUsageResponse = Record<string, unknown> & {
  readonly five_hour?: ClaudeUsageWindow | null;
  readonly seven_day?: ClaudeUsageWindow | null;
  readonly seven_day_opus?: ClaudeUsageWindow | null;
  readonly seven_day_sonnet?: ClaudeUsageWindow | null;
};

export function claudeUsageSnapshot(input: {
  readonly instanceId: ProviderInstanceId;
  readonly displayName: string;
  readonly response: ClaudeUsageResponse;
  readonly updatedAt: string;
}): ProviderUsageSnapshot {
  const labels: Readonly<Record<string, string>> = {
    five_hour: "Session",
    seven_day: "Weekly",
    seven_day_opus: "Opus weekly",
    seven_day_sonnet: "Sonnet weekly",
  };
  const windows = Object.entries(input.response).flatMap(([id, value]) => {
    if (!(id in labels) && !id.startsWith("seven_day_")) return [];
    if (
      typeof value !== "object" ||
      value === null ||
      !("utilization" in value) ||
      typeof value.utilization !== "number"
    )
      return [];
    const window = value as ClaudeUsageWindow;
    return [
      usageWindow({
        id,
        label: labels[id] ?? id.replaceAll("_", " "),
        usedPercent: value.utilization,
        ...(window.resets_at !== undefined ? { resetsAt: window.resets_at } : {}),
      }),
    ];
  });
  return snapshotBase({
    instanceId: input.instanceId,
    displayName: input.displayName,
    provider: "claudeAgent",
    windows,
    updatedAt: input.updatedAt,
  });
}

export const makeCodexUsageReader = Effect.fn("makeCodexUsageReader")(function* (input: {
  readonly instanceId: ProviderInstanceId;
  readonly displayName: string;
  readonly config: CodexSettings;
  readonly environment: NodeJS.ProcessEnv;
  readonly cwd: string;
}): Effect.fn.Return<ProviderUsageReader, never, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const read = Effect.scoped(
    Effect.gen(function* () {
      const scope = yield* Scope.Scope;
      const resolvedHomePath = input.config.homePath
        ? expandHomePath(input.config.homePath)
        : undefined;
      const env = {
        ...input.environment,
        ...(resolvedHomePath ? { CODEX_HOME: resolvedHomePath } : {}),
      };
      const args = codexSessionAppServerArgs(undefined, input.config.launchArgs);
      const command = yield* resolveSpawnCommand(input.config.binaryPath, args, {
        env,
        extendEnv: false,
      });
      const child = yield* spawner
        .spawn(
          ChildProcess.make(command.command, command.args, {
            cwd: input.cwd,
            env,
            extendEnv: false,
            forceKillAfter: "2 seconds",
            shell: command.shell,
          }),
        )
        .pipe(Effect.provideService(Scope.Scope, scope));
      const context = yield* CodexClient.layerChildProcess(child).pipe(
        Layer.build,
        Effect.provideService(Scope.Scope, scope),
      );
      const client = yield* Effect.service(CodexClient.CodexAppServerClient).pipe(
        Effect.provide(context),
      );
      yield* client.request("initialize", buildCodexInitializeParams());
      yield* client.notify("initialized", undefined);
      const response = yield* client.request("account/rateLimits/read", undefined);
      const updatedAt = DateTime.formatIso(yield* DateTime.now);
      return codexUsageSnapshot({
        instanceId: input.instanceId,
        displayName: input.displayName,
        response,
        updatedAt,
      });
    }),
  ).pipe(Effect.timeout("15 seconds"), Effect.orDie);
  return { read };
});

export const makeClaudeUsageReader = Effect.fn("makeClaudeUsageReader")(function* (input: {
  readonly instanceId: ProviderInstanceId;
  readonly displayName: string;
  readonly config: ClaudeSettings;
}): Effect.fn.Return<
  ProviderUsageReader,
  never,
  FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const client = yield* HttpClient.HttpClient;
  const home = yield* resolveClaudeHomePath(input.config);
  const candidates = input.config.homePath.trim()
    ? [path.join(home, ".credentials.json"), path.join(home, ".claude", ".credentials.json")]
    : [path.join(NodeOS.homedir(), ".claude", ".credentials.json")];
  const read = Effect.gen(function* () {
    let raw: string | undefined;
    for (const candidate of candidates) {
      raw = yield* fs.readFileString(candidate).pipe(
        Effect.option,
        Effect.map((value) => (value._tag === "Some" ? value.value : raw)),
      );
      if (raw) break;
    }
    if (!raw) return yield* Effect.die("Claude Code OAuth credentials were not found.");
    const parsed = JSON.parse(raw) as {
      claudeAiOauth?: { accessToken?: string; access_token?: string };
    };
    const token = parsed.claudeAiOauth?.accessToken ?? parsed.claudeAiOauth?.access_token;
    if (!token)
      return yield* Effect.die("Claude Code OAuth credentials do not contain an access token.");
    const request = HttpClientRequest.get("https://api.anthropic.com/api/oauth/usage").pipe(
      HttpClientRequest.setHeader("authorization", `Bearer ${token}`),
      HttpClientRequest.setHeader("anthropic-beta", "oauth-2025-04-20"),
      HttpClientRequest.setHeader("accept", "application/json"),
      HttpClientRequest.setHeader("user-agent", "claude-code/2.1.0"),
    );
    const response = yield* client
      .execute(request)
      .pipe(Effect.flatMap(HttpClientResponse.filterStatusOk));
    const body = (yield* response.json) as ClaudeUsageResponse;
    return claudeUsageSnapshot({
      instanceId: input.instanceId,
      displayName: input.displayName,
      response: body,
      updatedAt: DateTime.formatIso(yield* DateTime.now),
    });
  }).pipe(Effect.timeout("15 seconds"), Effect.orDie);
  return { read };
});
