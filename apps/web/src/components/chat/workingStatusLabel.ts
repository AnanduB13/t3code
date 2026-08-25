export const WORKING_STATUS_LABELS = [
  "Churning",
  "Scheming",
  "Tinkering",
  "Conjuring",
  "Untangling",
  "Plotting",
  "Polishing",
  "Wrangling",
  "Brewing",
  "Consulting ducks",
] as const;

export const WORKING_STATUS_ROTATION_MS = 4_200;

export function resolveWorkingStatusLabel(startedAtMs: number, nowMs: number): string {
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const index = Math.floor(elapsedMs / WORKING_STATUS_ROTATION_MS) % WORKING_STATUS_LABELS.length;
  return WORKING_STATUS_LABELS[index] ?? WORKING_STATUS_LABELS[0];
}
