# Scheduled tasks

Open **Scheduled** in the sidebar, choose the computer that should do the work,
then create a task. Choose a project, a configured coding agent and model, the
instructions, schedule, timezone, and permissions. Tasks use T3’s regular coding
agents, including Codex and Claude; Hermes is not required.

To schedule work on another computer, connect its T3 server in **Settings →
Connections** and set up its coding agents. A browser connection or a Computer Use
host alone does not make a computer a task runner. The selected computer owns its
schedules and runs them while its T3 server is running, even when the client is closed.

Use daily, weekly, or monthly schedules, a five-field cron expression, or an
interval such as `every 2h`. The form defaults to your timezone. Schedules survive
server restarts. After downtime, an enabled task catches up once, then continues
its schedule. A task skips scheduled runs while its previous run is still active.

Each run opens a new thread in the selected project’s existing workspace. Open
**Run history** to read results, respond to approval requests, or stop a run in its
thread. Permissions apply just as they do for ordinary coding work; tasks that
require approval can wait for you in the thread.

You can edit tasks, pause or resume future runs, run a task immediately, or delete
its schedule. Pausing and deleting do not stop a run already in progress or remove
its thread. Existing Hermes schedules stay in Hermes and are not migrated automatically.
