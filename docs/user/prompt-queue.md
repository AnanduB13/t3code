# Queuing follow-up prompts

When an agent is working, sending another prompt adds it to that thread's prompt queue. Prompts run
in order after the active turn finishes. Stopping the active turn does not discard or pause the
remaining queue; the next prompt starts after the provider acknowledges the stop.

Use the controls beside a queued prompt to edit its text, remove it, or steer it into the active
turn. Drag the handle at the start of a prompt to change the order. Queue changes are stored by the
environment, so the same order and edits remain after a refresh or reconnect.
