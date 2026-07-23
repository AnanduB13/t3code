// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalTimers:off preferSchemaOverJson:off - This module is an HTTP boundary around an external non-Effect service.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  HermesAgentError,
  type HermesAgentStatus,
  type HermesCronJob,
  type HermesCronRun,
  type HermesMessage,
  type HermesSession,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
const isHermesAgentError = Schema.is(HermesAgentError);

interface HermesClientOptions {
  readonly endpoint?: string;
  readonly apiKey?: string;
  readonly fetch?: Fetch;
  readonly envFile?: string;
  readonly configFile?: string;
  readonly cronJobsFile?: string;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
}

function contentString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function timestampString(value: unknown): string | null {
  if (typeof value === "number") {
    const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
    return new Date(milliseconds).toISOString();
  }
  return nullableString(value);
}

function cronJobIdFromSession(row: JsonObject): string | null {
  if (row.source !== "cron") return null;
  const match = nullableString(row.id)?.match(/^cron_([0-9a-f]{12})_/i);
  return match?.[1] ?? null;
}

export function normalizeHermesSession(value: unknown): HermesSession {
  const row = object(value);
  const id = nullableString(row.id)?.trim();
  if (!id) throw new Error("Hermes returned a session without an id.");
  return {
    id,
    title: nullableString(row.title),
    model: nullableString(row.model),
    source: nullableString(row.source),
    startedAt: timestampString(row.started_at),
    lastActive: timestampString(row.last_active),
    messageCount: typeof row.message_count === "number" ? row.message_count : 0,
    parentSessionId: nullableString(row.parent_session_id),
    cronJobId: cronJobIdFromSession(row),
  };
}

export function normalizeHermesCronJob(value: unknown): HermesCronJob {
  const row = object(value);
  const id = nullableString(row.id)?.trim();
  if (!id) throw new Error("Hermes returned a cron job without an id.");
  const repeat = object(row.repeat);
  return {
    id,
    name: nullableString(row.name)?.trim() || `Scheduled task ${id}`,
    prompt: nullableString(row.prompt) ?? "",
    scheduleDisplay:
      nullableString(row.schedule_display) ?? nullableString(object(row.schedule).display),
    enabled: row.enabled !== false,
    state: nullableString(row.state) ?? (row.enabled === false ? "paused" : "scheduled"),
    nextRunAt: timestampString(row.next_run_at),
    lastRunAt: timestampString(row.last_run_at),
    lastStatus: nullableString(row.last_status),
    completedRuns: typeof repeat.completed === "number" ? repeat.completed : 0,
  };
}

export function normalizeHermesMessage(value: unknown, index = 0): HermesMessage {
  const row = object(value);
  const role = nullableString(row.role) ?? "assistant";
  return {
    id: nullableString(row.id) ?? `${role}-${index}`,
    role,
    content: contentString(row.content),
    timestamp: timestampString(row.timestamp),
    toolName: nullableString(row.tool_name),
    reasoning: nullableString(row.reasoning_content ?? row.reasoning),
  };
}

function parseEnvValue(contents: string, name: string): string | undefined {
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] !== name) continue;
    const raw = match[2] ?? "";
    if (
      raw.length >= 2 &&
      ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
    ) {
      return raw.slice(1, -1);
    }
    return raw.replace(/\s+#.*$/, "").trim();
  }
  return undefined;
}

function parseConfigValue(contents: string, name: string): string | undefined {
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*?)\s*$/);
    if (!match || match[1] !== name) continue;
    const raw = match[2] ?? "";
    if (
      raw.length >= 2 &&
      ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
    ) {
      return raw.slice(1, -1);
    }
    return raw.trim();
  }
  return undefined;
}

export class HermesClient {
  readonly endpoint: string;
  readonly #fetch: Fetch;
  readonly #explicitApiKey: string | undefined;
  readonly #envFile: string;
  readonly #configFile: string;
  readonly #cronJobsFile: string;
  #apiKeyPromise: Promise<string | undefined> | undefined;
  readonly #cronRunResponseCache = new Map<
    string,
    Promise<{ response: string | null; responseAt: string | null }>
  >();

  constructor(options: HermesClientOptions = {}) {
    this.endpoint = (
      options.endpoint ??
      process.env.HERMES_API_URL ??
      "http://127.0.0.1:8642"
    ).replace(/\/+$/, "");
    this.#explicitApiKey =
      options.apiKey ?? process.env.HERMES_API_KEY ?? process.env.API_SERVER_KEY;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#envFile = options.envFile ?? join(homedir(), ".hermes", ".env");
    this.#configFile = options.configFile ?? join(homedir(), ".hermes", "config.yaml");
    this.#cronJobsFile = options.cronJobsFile ?? join(homedir(), ".hermes", "cron", "jobs.json");
  }

  async #apiKey(): Promise<string | undefined> {
    if (this.#explicitApiKey) return this.#explicitApiKey;
    this.#apiKeyPromise ??= Promise.all([
      readFile(this.#envFile, "utf8").catch(() => ""),
      readFile(this.#configFile, "utf8").catch(() => ""),
    ]).then(
      ([envContents, configContents]) =>
        parseEnvValue(envContents, "API_SERVER_KEY") ??
        parseConfigValue(configContents, "API_SERVER_KEY"),
    );
    return this.#apiKeyPromise;
  }

  async #request(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<unknown> {
    const apiKey = await this.#apiKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.#fetch(`${this.endpoint}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          accept: "application/json",
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          ...init.headers,
        },
      });
      const text = await response.text();
      let payload: unknown = {};
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { message: text };
        }
      }
      if (!response.ok) {
        const error = object(object(payload).error);
        throw new HermesAgentError({
          operation: `${init.method ?? "GET"} ${path}`,
          message:
            nullableString(error.message) ??
            nullableString(object(payload).message) ??
            `Hermes returned HTTP ${response.status}.`,
          status: response.status,
        });
      }
      return payload;
    } catch (cause) {
      if (isHermesAgentError(cause)) throw cause;
      throw new HermesAgentError({
        operation: `${init.method ?? "GET"} ${path}`,
        message:
          cause instanceof Error && cause.name === "AbortError"
            ? "Hermes did not respond before the request timed out."
            : cause instanceof Error
              ? cause.message
              : "Unable to reach Hermes.",
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async status(): Promise<HermesAgentStatus> {
    try {
      const health = object(await this.#request("/health", {}, 3_000));
      const models = object(
        await this.#request("/v1/models", {}, 3_000).catch((): JsonObject => ({})),
      );
      const firstModel = Array.isArray(models.data) ? object(models.data[0]) : {};
      return {
        available: true,
        endpoint: this.endpoint,
        ...(nullableString(health.version) ? { version: nullableString(health.version)! } : {}),
        ...(nullableString(firstModel.id) ? { model: nullableString(firstModel.id)! } : {}),
      };
    } catch (cause) {
      return {
        available: false,
        endpoint: this.endpoint,
        message: cause instanceof Error ? cause.message : "Unable to reach Hermes.",
      };
    }
  }

  async listSessions(): Promise<{ sessions: HermesSession[]; hasMore: boolean }> {
    const sessions: HermesSession[] = [];
    let offset = 0;
    let hasMore = false;
    do {
      const query = offset === 0 ? "" : `&offset=${offset}`;
      const payload = object(
        await this.#request(`/api/sessions?limit=200&include_children=true${query}`),
      );
      const page = Array.isArray(payload.data) ? payload.data.map(normalizeHermesSession) : [];
      sessions.push(...page);
      hasMore = payload.has_more === true;
      offset += page.length;
    } while (hasMore && offset < 1_000 && offset > 0);
    return {
      sessions,
      hasMore,
    };
  }

  async listCronJobs(): Promise<{ jobs: HermesCronJob[] }> {
    let rows: readonly unknown[] = [];
    try {
      const payload = await this.#request("/api/cron/jobs?profile=all");
      rows = Array.isArray(payload) ? payload : [];
    } catch (apiError) {
      const filePayload = await readFile(this.#cronJobsFile, "utf8")
        .then((contents) => object(JSON.parse(contents)))
        .catch(() => null);
      if (filePayload === null) throw apiError;
      rows = Array.isArray(filePayload.jobs) ? filePayload.jobs : [];
    }
    return { jobs: rows.map(normalizeHermesCronJob) };
  }

  async #cronRunResponse(session: HermesSession) {
    const key = `${session.id}:${session.lastActive ?? ""}`;
    const cached = this.#cronRunResponseCache.get(key);
    if (cached) return cached;
    const pending = this.messages(session.id).then(({ messages }) => {
      const response = [...messages]
        .reverse()
        .find(
          (message) =>
            message.role === "assistant" && message.toolName === null && message.content.trim(),
        );
      return {
        response: response?.content.trim() || null,
        responseAt: response?.timestamp ?? session.lastActive,
      };
    });
    this.#cronRunResponseCache.set(key, pending);
    if (this.#cronRunResponseCache.size > 1_000) {
      const oldest = this.#cronRunResponseCache.keys().next().value;
      if (oldest !== undefined) this.#cronRunResponseCache.delete(oldest);
    }
    return pending;
  }

  async listCronRuns(
    jobId: string,
    requestedLimit: number,
  ): Promise<{ jobId: string; runs: HermesCronRun[]; total: number; hasMore: boolean }> {
    const limit = Math.max(1, Math.min(Math.trunc(requestedLimit), 200));
    const { sessions } = await this.listSessions();
    const matching = sessions
      .filter((session) => session.cronJobId === jobId)
      .sort((a, b) => {
        const left = Date.parse(a.lastActive ?? a.startedAt ?? "") || 0;
        const right = Date.parse(b.lastActive ?? b.startedAt ?? "") || 0;
        return right - left;
      });
    const visible = matching.slice(0, limit);
    const runs = await Promise.all(
      visible.map(async (session): Promise<HermesCronRun> => {
        const output = await this.#cronRunResponse(session).catch(() => ({
          response: null,
          responseAt: session.lastActive,
        }));
        return {
          sessionId: session.id,
          title: session.title,
          startedAt: session.startedAt,
          completedAt: session.lastActive,
          response: output.response,
          responseAt: output.responseAt,
        };
      }),
    );
    return {
      jobId,
      runs,
      total: matching.length,
      hasMore: matching.length > visible.length,
    };
  }

  async messages(sessionId: string) {
    const payload = object(
      await this.#request(`/api/sessions/${encodeURIComponent(sessionId)}/messages`),
    );
    return {
      sessionId: nullableString(payload.session_id) ?? sessionId,
      messages: Array.isArray(payload.data)
        ? payload.data.map((message, index) => normalizeHermesMessage(message, index))
        : [],
    };
  }

  async createSession(title?: string): Promise<HermesSession> {
    const payload = object(
      await this.#request("/api/sessions", {
        method: "POST",
        body: JSON.stringify(title?.trim() ? { title: title.trim() } : {}),
      }),
    );
    return normalizeHermesSession(payload.session);
  }

  async updateSession(sessionId: string, title: string): Promise<HermesSession> {
    const payload = object(
      await this.#request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        body: JSON.stringify({ title: title.trim() }),
      }),
    );
    return normalizeHermesSession(payload.session);
  }

  async forkSession(sessionId: string, title?: string): Promise<HermesSession> {
    const payload = object(
      await this.#request(`/api/sessions/${encodeURIComponent(sessionId)}/fork`, {
        method: "POST",
        body: JSON.stringify(title?.trim() ? { title: title.trim() } : {}),
      }),
    );
    return normalizeHermesSession(payload.session);
  }

  async deleteSession(sessionId: string) {
    const payload = object(
      await this.#request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      }),
    );
    return { sessionId, deleted: payload.deleted === true };
  }

  async sendMessage(sessionId: string, message: string) {
    const payload = object(
      await this.#request(
        `/api/sessions/${encodeURIComponent(sessionId)}/chat`,
        { method: "POST", body: JSON.stringify({ message }) },
        10 * 60_000,
      ),
    );
    return {
      sessionId: nullableString(payload.session_id) ?? sessionId,
      message: normalizeHermesMessage(payload.message),
    };
  }
}

export const hermesClient = new HermesClient();
