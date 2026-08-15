# Scheduled tasks

Scheduled tasks let Hermes run a prompt repeatedly without starting it by hand. Open **Scheduled** beneath Agents in the main sidebar, then choose **New scheduled task**.

Each task has a title, an instruction, a schedule, and an optional project folder. You can schedule daily, weekly, or monthly work at a specific time, or enter a custom Hermes schedule. Selecting a project gives the agent that folder as its working directory and loads its project instructions; selecting the agent workspace runs without project context.

Every run creates a separate result in the task's history. From a task you can edit its instructions, pause or resume future runs, run it immediately, or delete the schedule. Deleting a schedule keeps its previous results available under **All**.

Scheduled tasks use the timezone shown in the creation form. The T3 server and Hermes gateway must be running when a task is due. Runs are unattended and use the tools, model, permissions, and safety settings configured for Hermes, so write prompts that are safe to execute without follow-up questions.
