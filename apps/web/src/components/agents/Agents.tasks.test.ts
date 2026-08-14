import { assert, describe, it } from "@effect/vitest";

import type { HermesCronJob, HermesCronRun, HermesSession } from "@t3tools/contracts";
import { chronologicalCronRuns, groupHermesTasks } from "./Agents.tasks";

const session = (values: Partial<HermesSession> & Pick<HermesSession, "id">): HermesSession => ({
  title: null,
  model: null,
  source: null,
  startedAt: null,
  lastActive: null,
  messageCount: 2,
  parentSessionId: null,
  cronJobId: null,
  ...values,
});

const job = (values: Partial<HermesCronJob> & Pick<HermesCronJob, "id">): HermesCronJob => ({
  name: "",
  prompt: "",
  schedule: null,
  scheduleDisplay: null,
  workdir: null,
  delivery: null,
  enabled: true,
  state: "scheduled",
  nextRunAt: null,
  lastRunAt: null,
  lastStatus: null,
  completedRuns: 0,
  ...values,
});

describe("groupHermesTasks", () => {
  it("groups cron runs by stable job id and keeps regular sessions as chats", () => {
    const result = groupHermesTasks(
      [job({ id: "93fe4bee7e62", name: "GTA 6 Watch" })],
      [
        session({
          id: "cron_93fe4bee7e62_2",
          cronJobId: "93fe4bee7e62",
          lastActive: "2026-07-23T02:00:00Z",
        }),
        session({
          id: "cron_93fe4bee7e62_1",
          cronJobId: "93fe4bee7e62",
          lastActive: "2026-07-23T01:00:00Z",
        }),
        session({ id: "api_1", title: "Normal chat" }),
      ],
    );

    assert.strictEqual(result.tasks.length, 1);
    assert.strictEqual(result.tasks[0]?.name, "GTA 6 Watch");
    assert.deepStrictEqual(
      result.tasks[0]?.runs.map((run) => run.id),
      ["cron_93fe4bee7e62_2", "cron_93fe4bee7e62_1"],
    );
    assert.deepStrictEqual(
      result.chats.map((chat) => chat.id),
      ["api_1"],
    );
  });

  it("keeps historical runs as an archived task when the job no longer exists", () => {
    const result = groupHermesTasks(
      [],
      [
        session({
          id: "cron_abcdef123456_1",
          cronJobId: "abcdef123456",
          title: "Daily report · Jul 23 03:10",
        }),
      ],
    );
    assert.strictEqual(result.tasks[0]?.name, "Daily report");
    assert.isNull(result.tasks[0]?.job);
  });
});

describe("chronologicalCronRuns", () => {
  it("places the newest response at the bottom", () => {
    const run = (sessionId: string, responseAt: string): HermesCronRun => ({
      sessionId,
      title: null,
      startedAt: responseAt,
      completedAt: responseAt,
      response: sessionId,
      responseAt,
    });
    const result = chronologicalCronRuns([
      run("newest", "2026-07-23T03:00:00Z"),
      run("oldest", "2026-07-23T01:00:00Z"),
      run("middle", "2026-07-23T02:00:00Z"),
    ]);
    assert.deepStrictEqual(
      result.map((item) => item.sessionId),
      ["oldest", "middle", "newest"],
    );
  });
});
