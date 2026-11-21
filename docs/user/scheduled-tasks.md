# Scheduled tasks

Open **Settings → Scheduled tasks** (or **Scheduled** in the sidebar) and choose
**New task**. Pick the computer it **Runs on**, a project, a coding agent and model,
the prompt, and a schedule. Agents can also create and change tasks for you.

To schedule work on another computer, connect its T3 server in **Settings →
Connections** and set up its coding agents. The list shows the tasks of every
connected computer. Each computer owns its tasks and runs them while its T3 server
is running, even when no client is open.

Schedules:

- **At a time** runs at a time of day on chosen weekdays, in that computer's time zone.
- **Once** runs a single time.
- **Every interval** repeats after a number of minutes, for example 120 for every two hours.
- **Custom (cron)** takes a five-field cron expression (minute, hour, day of month,
  month, day of week) and the time zone it is read in, such as `0 9 * * 1-5` in
  `Europe/London`. The form previews the next runs.
- **On webhook** runs for each request sent to the task's URL.

A run the computer was off for is skipped for time and cron schedules, and runs
late for intervals. You can pause, resume, edit, run now, or delete a task. Pausing
and deleting do not stop a run already in progress or remove its thread.
