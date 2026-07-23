import { assert, describe, it } from "@effect/vitest";

import { HermesAgentError } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import {
  HermesClient,
  normalizeHermesCronJob,
  normalizeHermesMessage,
  normalizeHermesSession,
} from "./HermesClient.ts";

describe("HermesClient", () => {
  it("normalizes Hermes session and message payloads", () => {
    assert.deepStrictEqual(
      normalizeHermesSession({
        id: "api_1",
        title: "Deploy it",
        message_count: 3,
        last_active: 1_700_000_000,
      }),
      {
        id: "api_1",
        title: "Deploy it",
        model: null,
        source: null,
        startedAt: null,
        lastActive: "2023-11-14T22:13:20.000Z",
        messageCount: 3,
        parentSessionId: null,
        cronJobId: null,
      },
    );
    assert.deepStrictEqual(
      normalizeHermesMessage({ role: "assistant", content: { ok: true } }, 2),
      {
        id: "assistant-2",
        role: "assistant",
        content: '{\n  "ok": true\n}',
        timestamp: null,
        toolName: null,
        reasoning: null,
      },
    );
  });

  it("normalizes cron jobs and identifies their run sessions", () => {
    assert.strictEqual(
      normalizeHermesSession({
        id: "cron_93fe4bee7e62_20260723_031050",
        source: "cron",
      }).cronJobId,
      "93fe4bee7e62",
    );
    assert.deepStrictEqual(
      normalizeHermesCronJob({
        id: "93fe4bee7e62",
        name: "GTA 6 Watch",
        prompt: "Check for news",
        schedule_display: "every 60m",
        enabled: true,
        state: "scheduled",
        next_run_at: "2026-07-23T04:10:00Z",
        last_run_at: "2026-07-23T03:10:00Z",
        last_status: "ok",
        repeat: { completed: 12 },
      }),
      {
        id: "93fe4bee7e62",
        name: "GTA 6 Watch",
        prompt: "Check for news",
        scheduleDisplay: "every 60m",
        enabled: true,
        state: "scheduled",
        nextRunAt: "2026-07-23T04:10:00Z",
        lastRunAt: "2026-07-23T03:10:00Z",
        lastStatus: "ok",
        completedRuns: 12,
      },
    );
  });

  it("uses bearer auth and maps session responses", async () => {
    const requests: Request[] = [];
    const client = new HermesClient({
      endpoint: "http://hermes.test/",
      apiKey: "secret",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(
          JSON.stringify({ data: [{ id: "api_1", title: "Task", message_count: 1 }] }),
          { status: 200 },
        );
      },
    });

    const result = await client.listSessions();
    assert.strictEqual(result.sessions[0]?.id, "api_1");
    assert.strictEqual(requests[0]?.headers.get("authorization"), "Bearer secret");
    assert.strictEqual(
      requests[0]?.url,
      "http://hermes.test/api/sessions?limit=200&include_children=true",
    );
  });

  it("paginates session history so recurring task runs are not truncated", async () => {
    const requests: Request[] = [];
    const client = new HermesClient({
      endpoint: "http://hermes.test",
      apiKey: "secret",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        const offset = new URL(request.url).searchParams.get("offset");
        return new Response(
          JSON.stringify({
            data: [{ id: offset ? "cron_job_2" : "cron_job_1" }],
            has_more: offset === null,
          }),
        );
      },
    });
    const result = await client.listSessions();
    assert.deepStrictEqual(
      result.sessions.map((session) => session.id),
      ["cron_job_1", "cron_job_2"],
    );
    assert.strictEqual(
      requests[1]?.url,
      "http://hermes.test/api/sessions?limit=200&include_children=true&offset=1",
    );
    assert.isFalse(result.hasMore);
  });

  it("returns cron history with only each run's final assistant response", async () => {
    const client = new HermesClient({
      endpoint: "http://hermes.test",
      apiKey: "secret",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        if (request.url.endsWith("/messages")) {
          return new Response(
            JSON.stringify({
              data: [
                { role: "user", content: "Repeated cron wrapper and prompt" },
                { role: "assistant", content: "The visible result", timestamp: 20 },
              ],
            }),
          );
        }
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "cron_93fe4bee7e62_20260723_031050",
                source: "cron",
                title: "GTA watch",
                started_at: 10,
                last_active: 20,
              },
              { id: "api_chat", source: "api_server", last_active: 30 },
            ],
            has_more: false,
          }),
        );
      },
    });

    const result = await client.listCronRuns("93fe4bee7e62", 20);
    assert.strictEqual(result.total, 1);
    assert.isFalse(result.hasMore);
    assert.deepStrictEqual(result.runs[0], {
      sessionId: "cron_93fe4bee7e62_20260723_031050",
      title: "GTA watch",
      startedAt: "1970-01-01T00:00:10.000Z",
      completedAt: "1970-01-01T00:00:20.000Z",
      response: "The visible result",
      responseAt: "1970-01-01T00:00:20.000Z",
    });
  });

  it("lists Hermes cron jobs", async () => {
    const client = new HermesClient({
      endpoint: "http://hermes.test",
      apiKey: "secret",
      fetch: async () =>
        new Response(
          JSON.stringify([
            { id: "abcdef123456", name: "Daily brief", schedule_display: "every 24h" },
          ]),
        ),
    });
    const result = await client.listCronJobs();
    assert.strictEqual(result.jobs[0]?.name, "Daily brief");
    assert.strictEqual(result.jobs[0]?.scheduleDisplay, "every 24h");
  });

  it("falls back to the local Hermes cron store when the API lacks cron routes", async () => {
    const client = new HermesClient({
      endpoint: "http://hermes.test",
      apiKey: "secret",
      cronJobsFile: new URL("./fixtures/hermes-cron-jobs.json", import.meta.url).pathname,
      fetch: async () => new Response("Not found", { status: 404 }),
    });
    const result = await client.listCronJobs();
    assert.strictEqual(result.jobs[0]?.id, "fixture123456");
    assert.strictEqual(result.jobs[0]?.completedRuns, 7);
  });

  it("returns a disconnected status without throwing", async () => {
    const client = new HermesClient({
      endpoint: "http://hermes.test",
      fetch: async () => {
        throw new Error("connection refused");
      },
    });
    assert.deepStrictEqual(await client.status(), {
      available: false,
      endpoint: "http://hermes.test",
      message: "connection refused",
    });
  });

  it("preserves API error details", async () => {
    const client = new HermesClient({
      endpoint: "http://hermes.test",
      fetch: async () =>
        new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 }),
    });
    const error = await client.listSessions().then(
      () => null,
      (cause: unknown) => cause,
    );
    assert.isTrue(Schema.is(HermesAgentError)(error));
    if (!Schema.is(HermesAgentError)(error)) return;
    assert.strictEqual(error.status, 401);
    assert.strictEqual(error.message, "bad key");
  });
});
