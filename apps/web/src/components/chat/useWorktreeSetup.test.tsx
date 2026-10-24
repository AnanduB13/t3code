import { EnvironmentId, ThreadId, type WorktreeSetupSnapshot } from "@t3tools/contracts";
import { act, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { useWorktreeSetup } from "./useWorktreeSetup";

const query = vi.hoisted(() => ({ data: undefined as WorktreeSetupSnapshot | null | undefined }));
vi.mock("../../state/query", () => ({ useEnvironmentQuery: () => query }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../../state/threads", () => ({ threadEnvironment: {} }));
vi.mock("../../state/vcs", () => ({ vcsEnvironment: { worktreeSetup: vi.fn() } }));
vi.mock("../../terminalUiStateStore", () => ({ useTerminalUiStateStore: () => vi.fn() }));

const environmentId = EnvironmentId.make("environment-one");
const threadId = ThreadId.make("thread-one");
let renderer: ReactTestRenderer | undefined;
let setup: ReturnType<typeof useWorktreeSetup> | undefined;

function Setup({ environment = environmentId, thread = threadId }) {
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
    setup = next;
  }, [next]);
  return null;
}

async function renderSetup(props: Parameters<typeof Setup>[0] = {}) {
  await act(() => {
    if (renderer) renderer.update(<Setup {...props} />);
    else renderer = create(<Setup {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  query.data = undefined;
});

afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  setup = undefined;
  vi.unstubAllGlobals();
});

it("opens a thread with a fresh route reference while setup is loading", async () => {
  await renderSetup();
  expect(setup?.worktreeSetup).toBeNull();
  await renderSetup();
  expect(setup?.blocksSend).toBe(false);
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
  query.data = snapshot;
  await renderSetup();
  expect(setup?.worktreeSetup).toEqual(snapshot);

  query.data = { ...snapshot, sequence: 1 };
  await renderSetup();
  expect(setup?.worktreeSetup?.sequence).toBe(2);
  query.data = null;
  await renderSetup();
  expect(setup?.worktreeSetup).toEqual(snapshot);

  await renderSetup({ environment: EnvironmentId.make("environment-two") });
  expect(setup?.worktreeSetup).toBeNull();
  query.data = snapshot;
  await renderSetup();
  query.data = null;
  await renderSetup({ thread: ThreadId.make("thread-two") });
  expect(setup?.worktreeSetup).toBeNull();
});
