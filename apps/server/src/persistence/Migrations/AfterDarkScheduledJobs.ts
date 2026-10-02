import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE IF NOT EXISTS scheduled_jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL)`;
  yield* sql`CREATE TABLE IF NOT EXISTS scheduled_job_runs (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL
  )`;
  yield* sql`CREATE INDEX IF NOT EXISTS scheduled_job_runs_job ON scheduled_job_runs(job_id, created_at DESC)`;
});
