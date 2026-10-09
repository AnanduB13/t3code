import {
  EnvironmentId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ScheduledJob,
  type ScheduledJobsSnapshot,
  type ServerProvider,
} from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer, type ReactTestInstance } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { ScheduledJobsPage } from "./ScheduledJobsPage";
import { useAgentsSidebarStore } from "./agentsSidebarStore";

const local = EnvironmentId.make("desktop");
const remote = EnvironmentId.make("k11");
const projectId = ProjectId.make("k11-project");
const environments = [
  { environmentId: local, label: "Desktop", connection: { phase: "connected" } },
  { environmentId: remote, label: "K11", connection: { phase: "connected" } },
];
const provider: ServerProvider = {
  instanceId: ProviderInstanceId.make("claudeCode"),
  driver: ProviderDriverKind.make("claudeCode"),
  displayName: "Claude",
  enabled: true,
  installed: true,
  version: "1",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-09-30T00:00:00.000Z",
  models: [{ slug: "test-claude", name: "Claude model", isCustom: false, capabilities: null }],
  slashCommands: [],
  skills: [],
};
const job: ScheduledJob = {
  id: "k11-job",
  name: "K11 review",
  prompt: "Review this project",
  projectId,
  modelSelection: { instanceId: provider.instanceId, model: "test-claude" },
  runtimeMode: "approval-required",
  schedule: "0 9 * * *",
  timezone: "UTC",
  enabled: true,
  nextRunAt: "2026-10-01T09:00:00.000Z",
  createdAt: "2026-09-30T00:00:00.000Z",
  updatedAt: "2026-09-30T00:00:00.000Z",
};
const snapshots = new Map<EnvironmentId, ScheduledJobsSnapshot>();
const save = vi.fn(async (_request: unknown) => ({ _tag: "Success", value: job }));
const setEnabled = vi.fn(async (_request: unknown) => ({ _tag: "Success", value: job }));
const run = vi.fn(async (_request: unknown) => ({ _tag: "Success", value: {} }));
const remove = vi.fn(async (_request: unknown) => ({ _tag: "Success", value: undefined }));
const refresh = vi.fn();

vi.mock("../../state/environments", () => ({
  usePrimaryEnvironmentId: () => local,
  useEnvironments: () => ({ environments, isReady: true }),
}));
vi.mock("../../state/scheduledJobs", () => ({
  scheduledJobsEnvironment: {
    list: ({ environmentId }: { environmentId: EnvironmentId }) => environmentId,
    save: "save",
    setEnabled: "setEnabled",
    run: "run",
    remove: "remove",
  },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (id: EnvironmentId | null) => ({
    data: id ? snapshots.get(id) : null,
    error: null,
    isPending: false,
    isSuccess: id !== null,
    refresh,
  }),
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => ({ save, setEnabled, run, remove })[command],
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [
    {
      id: ProjectId.make("local-project"),
      environmentId: local,
      title: "Desktop project",
      defaultModelSelection: null,
    },
    {
      id: projectId,
      environmentId: remote,
      title: "K11 project",
      defaultModelSelection: job.modelSelection,
    },
  ],
  useServerConfigs: () => new Map([[remote, { providers: [provider] }]]),
}));
vi.mock("../../workspaceTitlebar", () => ({ COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS: "" }));
vi.mock("@tanstack/react-router", () => ({ Link: "a" }));
vi.mock("../ui/sidebar", () => ({ SidebarInset: "main" }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/badge", () => ({ Badge: "span" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/textarea", () => ({ Textarea: "textarea" }));
vi.mock("../ui/dialog", () => ({
  Dialog: "dialog",
  DialogPopup: "section",
  DialogHeader: "header",
  DialogTitle: "h2",
  DialogDescription: "p",
  DialogPanel: "div",
  DialogFooter: "footer",
}));

let renderer: ReactTestRenderer | undefined;
function text(node: ReactTestInstance | string): string {
  return typeof node === "string" ? node : node.children.map(text).join("");
}
function root() {
  if (!renderer) throw new Error("Not mounted");
  return renderer.root;
}
function button(label: string) {
  const found = root()
    .findAllByType("button")
    .find((entry) => text(entry) === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
function label(control: string) {
  const found = root()
    .findAllByType("label")
    .find((entry) => text(entry).startsWith(control));
  if (!found) throw new Error(`Missing label ${control}`);
  return found;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  snapshots.set(local, { jobs: [], runs: [] });
  snapshots.set(remote, { jobs: [job], runs: [] });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  useAgentsSidebarStore.setState(useAgentsSidebarStore.getInitialState());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("creates a coding-agent job with the selected computer’s project and model", async () => {
  await act(async () => {
    renderer = create(<ScheduledJobsPage />);
  });
  expect(text(root())).toContain("No scheduled tasks yet");
  await act(async () =>
    root()
      .findByProps({ "aria-label": "Computer for scheduled tasks" })
      .props.onChange({ target: { value: remote } }),
  );
  expect(text(root())).toContain("K11 review");
  await act(async () => button("New scheduled task").props.onClick());
  expect(text(label("Project"))).toContain("K11 project");
  expect(text(label("Project"))).not.toContain("Desktop project");
  expect(text(label("Agent and model"))).toContain("Claude model");
  await act(async () => {
    label("Title")
      .findByType("input")
      .props.onChange({ target: { value: "Daily summary" } });
    label("Instructions")
      .findByType("textarea")
      .props.onChange({ target: { value: "Summarize changes" } });
    label("Timezone")
      .findByType("input")
      .props.onChange({ target: { value: "Asia/Kolkata" } });
  });
  await act(async () =>
    root()
      .findByType("form")
      .props.onSubmit({ preventDefault() {} }),
  );
  expect(save).toHaveBeenCalledWith({
    environmentId: remote,
    input: {
      job: {
        name: "Daily summary",
        prompt: "Summarize changes",
        projectId,
        modelSelection: job.modelSelection,
        runtimeMode: "approval-required",
        schedule: "0 9 * * *",
        timezone: "Asia/Kolkata",
      },
    },
  });
  expect(refresh).toHaveBeenCalled();
});

it("pauses and resumes the same remote job, filters paused tasks and runs it manually", async () => {
  useAgentsSidebarStore.setState({ environmentId: remote });
  await act(async () => {
    renderer = create(<ScheduledJobsPage />);
  });
  await act(async () => button("Pause").props.onClick());
  expect(setEnabled).toHaveBeenLastCalledWith({
    environmentId: remote,
    input: { id: job.id, enabled: false },
  });
  snapshots.set(remote, { jobs: [{ ...job, enabled: false }], runs: [] });
  await act(async () => renderer?.update(<ScheduledJobsPage />));
  await act(async () =>
    root()
      .findByProps({ type: "checkbox" })
      .props.onChange({ target: { checked: false } }),
  );
  expect(text(root())).not.toContain("K11 review");
  await act(async () =>
    root()
      .findByProps({ type: "checkbox" })
      .props.onChange({ target: { checked: true } }),
  );
  await act(async () => button("Resume").props.onClick());
  expect(setEnabled).toHaveBeenLastCalledWith({
    environmentId: remote,
    input: { id: job.id, enabled: true },
  });
  await act(async () => button("Run now").props.onClick());
  expect(run).toHaveBeenCalledWith({ environmentId: remote, input: { id: job.id } });
});

it("discards an editor when the target computer changes", async () => {
  useAgentsSidebarStore.setState({ environmentId: remote });
  await act(async () => {
    renderer = create(<ScheduledJobsPage />);
  });
  await act(async () => button("Edit").props.onClick());
  expect(root().findAllByType("form")).toHaveLength(1);
  await act(async () => useAgentsSidebarStore.getState().setEnvironmentId(local));
  expect(root().findAllByType("form")).toHaveLength(0);
  expect(text(root())).not.toContain("K11 review");
});
