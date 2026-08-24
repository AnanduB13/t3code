# Usage and local CLI history

Open **Usage** in the sidebar to see token activity recorded in the local Codex and Claude Code
history on every connected environment. The totals include both T3 Code sessions and sessions run
directly from a terminal.

Choose **7 days**, **30 days**, **90 days**, or **All time** to change the reporting window. **All
time** reads every available provider transcript while the chart begins at the first day that has
recorded activity.

The **Device usage** row shows which environment machines contributed and how many Codex and Claude
Code sessions were found. When T3 is connected to a remote environment, the listed device is the
remote environment's machine, not the phone or browser viewing it.

T3 extracts only the token-usage fields needed for the summary and sends aggregate counts to the
client; transcript content is not returned. Sessions without token telemetry are not included.
Older Codex CLI releases did not record token events for every interactive session, so their device
total can be lower than actual account usage.

Provider quota cards in chat and Profile settings are separate from this token history. They show
the current plan windows reported by Codex or Claude Code.
