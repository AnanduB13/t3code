import { EnvironmentId, ThreadId, type WorktreeSetupSnapshot } from "@t3tools/contracts";
import { useLayoutEffect } from "react";
import { expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import { useWorktreeSetup } from "./useWorktreeSetup";

const query = vi.hoisted(() => ({ data: undefined as WorktreeSetupSnapshot | null | undefined }));
vi.mock(import("../../state/query"), async (original) => ({
  ...(await original()),
  useEnvironmentQuery: (() => query) as never,
}));
vi.mock(import("../../state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => vi.fn()) as never,
}));
vi.mock(import("../../terminalUiStateStore"), async (original) => ({
  ...(await original()),
  useTerminalUiStateStore: (() => vi.fn()) as never,
}));

const environmentId = EnvironmentId.make("environment-one");
const threadId = ThreadId.make("thread-one");
type SetupResult = ReturnType<typeof useWorktreeSetup>;

function Setup({
  environment = environmentId,
  thread = threadId,
  onSetup,
}: {
  environment?: EnvironmentId;
  thread?: ThreadId;
  onSetup: (setup: SetupResult) => void;
}) {
  const next = useWorktreeSetup({
    routeThreadRef: { environmentId: environment, threadId: thread },
    ownerKey: `${environment}:${thread}`,
    activeThread: { id: thread, worktreePath: "/tmp/test-worktree" },
    threadRef: { environmentId: environment, threadId: thread },
    serverProjection: null,
    activityRun: null,
    localPreparing: false,
    sendQueuesBehindSetup: false,
    followUpSent: false,
  });
  useLayoutEffect(() => {
    onSetup(next);
  }, [next, onSetup]);
  return null;
}

type SetupProps = { environment?: EnvironmentId; thread?: ThreadId };

// The mocked query reads `query`, so every test sets it before rendering.
async function renderSetup(data: WorktreeSetupSnapshot | null | undefined) {
  query.data = data;
  let latest: SetupResult | undefined;
  const onSetup = (setup: SetupResult) => {
    latest = setup;
  };
  const screen = await render(<Setup onSetup={onSetup} />);
  return {
    setup: () => latest,
    update: (next: SetupProps = {}) => screen.rerender(<Setup {...next} onSetup={onSetup} />),
    [Symbol.asyncDispose]: () => screen[Symbol.asyncDispose](),
  };
}

it("opens a thread with a fresh route reference while setup is loading", async () => {
  await using hook = await renderSetup(undefined);
  expect(hook.setup()?.worktreeSetup).toBeNull();
  await hook.update();
  expect(hook.setup()?.blocksSend).toBe(false);
});

it("retains the newest setup snapshot until the route changes", async () => {
  const snapshot: WorktreeSetupSnapshot = {
    threadId,
    phase: "running",
    startedAt: "2026-10-21T14:00:00.000Z",
    endedAt: null,
    branch: "feature",
    baseRef: "main",
    worktreePath: "/tmp/test-worktree",
    setupScript: null,
    stages: [],
    error: null,
    sequence: 2,
  };
  await using hook = await renderSetup(snapshot);
  expect(hook.setup()?.worktreeSetup).toEqual(snapshot);

  query.data = { ...snapshot, sequence: 1 };
  await hook.update();
  expect(hook.setup()?.worktreeSetup?.sequence).toBe(2);
  query.data = null;
  await hook.update();
  expect(hook.setup()?.worktreeSetup).toEqual(snapshot);

  await hook.update({ environment: EnvironmentId.make("environment-two") });
  expect(hook.setup()?.worktreeSetup).toBeNull();
  query.data = snapshot;
  await hook.update();
  query.data = null;
  await hook.update({ thread: ThreadId.make("thread-two") });
  expect(hook.setup()?.worktreeSetup).toBeNull();
});
