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

export type WorkingStatusLabelState = {
  readonly threadKey: string;
  readonly turnId: string | null;
  readonly working: boolean;
  readonly labelIndex: number | null;
};

function hashLabelSeed(seed: string): number {
  let hash = 5381;
  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 33) ^ seed.charCodeAt(index);
  }
  return Math.abs(hash) % WORKING_STATUS_LABELS.length;
}

export function advanceWorkingStatusLabelState(
  previous: WorkingStatusLabelState,
  input: {
    readonly threadKey: string;
    readonly turnId: string | null;
    readonly working: boolean;
  },
): WorkingStatusLabelState {
  const sameThread = previous.threadKey === input.threadKey;
  const prior = sameThread
    ? previous
    : { threadKey: input.threadKey, turnId: null, working: false, labelIndex: null };

  if (!input.working) {
    return { ...prior, turnId: input.turnId, working: false };
  }

  const newGeneration =
    !prior.working ||
    (prior.turnId !== null && input.turnId !== null && prior.turnId !== input.turnId);
  if (!newGeneration) {
    // Optimistic turns initially have no server id. Adopt it without changing
    // the phrase the user has already seen for this generation.
    return { ...prior, turnId: input.turnId ?? prior.turnId, working: true };
  }

  const seed = input.turnId ?? `${input.threadKey}:next`;
  const labelIndex =
    prior.labelIndex === null
      ? hashLabelSeed(seed)
      : (prior.labelIndex + 1) % WORKING_STATUS_LABELS.length;
  return {
    threadKey: input.threadKey,
    turnId: input.turnId,
    working: true,
    labelIndex,
  };
}

export function workingStatusLabel(state: WorkingStatusLabelState): string {
  return state.labelIndex === null
    ? WORKING_STATUS_LABELS[0]
    : (WORKING_STATUS_LABELS[state.labelIndex] ?? WORKING_STATUS_LABELS[0]);
}
