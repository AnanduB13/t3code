import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { act, useState, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { DraftId } from "../../composerDraftStore";
import { useChatWorkspaceLayoutStore } from "../../chatWorkspaceLayout";
import { ChatWorkspace } from "./ChatWorkspace";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../../hooks/useMediaQuery", () => ({ useIsMobile: () => false }));
vi.mock("../../state/entities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../state/entities")>()),
  useThreadShell: () => ({}),
  useThreadProjection: () => ({}),
}));
vi.mock("../DiffWorkerPoolProvider", () => ({
  DiffWorkerPoolProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../ui/sidebar", () => ({ SidebarInset: "main" }));
vi.mock("../ChatView", () => ({
  default: function DraftContent() {
    const [prompt, setPrompt] = useState("");
    return <input value={prompt} onChange={(event) => setPrompt(event.currentTarget.value)} />;
  },
}));

const ref = {
  environmentId: EnvironmentId.make("environment"),
  threadId: ThreadId.make("reserved-thread"),
};
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});

it("keeps draft content through promotion and resets it for a different draft", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useChatWorkspaceLayoutStore.setState({
    paneThreadKeys: [],
    activePaneIndex: 0,
    columns: 1,
    columnWeights: [1],
    rowWeights: [1],
  });
  await act(() => {
    renderer = create(
      <ChatWorkspace
        routeThreadRef={ref}
        routePane={{ routeKind: "draft", draftId: DraftId.make("draft-a"), chatViewKey: "draft-a" }}
      />,
    );
  });
  await act(() =>
    renderer!.root
      .findByType("input")
      .props.onChange({ currentTarget: { value: "Keep this unsent prompt" } }),
  );
  await act(() =>
    renderer!.update(
      <ChatWorkspace
        routeThreadRef={ref}
        routePane={{ routeKind: "server", chatViewKey: "draft-a" }}
      />,
    ),
  );
  expect(renderer!.root.findByType("input").props.value).toBe("Keep this unsent prompt");
  await act(() =>
    renderer!.update(
      <ChatWorkspace
        routeThreadRef={ref}
        routePane={{ routeKind: "draft", draftId: DraftId.make("draft-b"), chatViewKey: "draft-b" }}
      />,
    ),
  );
  expect(renderer!.root.findByType("input").props.value).toBe("");
});
