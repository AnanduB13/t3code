import type { HermesCronJob, HermesCronRun, HermesSession } from "@t3tools/contracts";

export interface HermesTaskGroup {
  readonly id: string;
  readonly job: HermesCronJob | null;
  readonly name: string;
  readonly runs: readonly HermesSession[];
  readonly latestRun: HermesSession | null;
}

export function localScheduledTasks(tasks: readonly HermesTaskGroup[]): readonly HermesTaskGroup[] {
  return tasks.filter((task) => task.job?.delivery === "local");
}

const RUN_SUFFIX = /\s*·\s*[A-Z][a-z]{2}\s+\d{1,2}\s+\d{1,2}:\d{2}(?:\s+#\d+)?$/;

function timestamp(session: HermesSession): number {
  const value = session.lastActive ?? session.startedAt;
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateTimestamp(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function chronologicalCronRuns(runs: readonly HermesCronRun[]): HermesCronRun[] {
  return [...runs].sort((left, right) => {
    const leftTimestamp = dateTimestamp(left.responseAt ?? left.completedAt ?? left.startedAt);
    const rightTimestamp = dateTimestamp(right.responseAt ?? right.completedAt ?? right.startedAt);
    return leftTimestamp - rightTimestamp;
  });
}

export function groupHermesTasks(
  jobs: readonly HermesCronJob[],
  sessions: readonly HermesSession[],
): {
  readonly tasks: readonly HermesTaskGroup[];
  readonly chats: readonly HermesSession[];
} {
  const runsByJob = new Map<string, HermesSession[]>();
  const chats: HermesSession[] = [];

  for (const session of sessions) {
    if (!session.cronJobId) {
      chats.push(session);
      continue;
    }
    const runs = runsByJob.get(session.cronJobId) ?? [];
    runs.push(session);
    runsByJob.set(session.cronJobId, runs);
  }

  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const ids = new Set([...jobsById.keys(), ...runsByJob.keys()]);
  const tasks = [...ids].map((id): HermesTaskGroup => {
    const runs = (runsByJob.get(id) ?? []).sort((a, b) => timestamp(b) - timestamp(a));
    const job = jobsById.get(id) ?? null;
    const fallbackName = runs[0]?.title?.replace(RUN_SUFFIX, "").trim();
    return {
      id,
      job,
      name: job?.name.trim() || fallbackName || `Scheduled task ${id}`,
      runs,
      latestRun: runs[0] ?? null,
    };
  });

  tasks.sort(
    (a, b) =>
      (b.latestRun ? timestamp(b.latestRun) : dateTimestamp(b.job?.lastRunAt)) -
      (a.latestRun ? timestamp(a.latestRun) : dateTimestamp(a.job?.lastRunAt)),
  );
  chats.sort((a, b) => timestamp(b) - timestamp(a));
  return { tasks, chats };
}
