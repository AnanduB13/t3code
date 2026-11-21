import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useState, type ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { DraftId } from "../../composerDraftStore";
import { useChatWorkspaceLayoutStore } from "../../chatWorkspaceLayout";
import { ChatWorkspace } from "./ChatWorkspace";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
}));
vi.mock("../../hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));
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

it("keeps draft content through promotion and resets it for a different draft", async () => {
  useChatWorkspaceLayoutStore.setState({
    paneThreadKeys: [],
    activePaneIndex: 0,
    columns: 1,
    columnWeights: [1],
    rowWeights: [1],
  });
  await using screen = await render(
    <ChatWorkspace
      routeThreadRef={ref}
      routePane={{ routeKind: "draft", draftId: DraftId.make("draft-a"), chatViewKey: "draft-a" }}
    />,
  );
  const input = screen.getByRole("textbox");
  await userEvent.fill(input, "Keep this unsent prompt");
  await screen.rerender(
    <ChatWorkspace
      routeThreadRef={ref}
      routePane={{ routeKind: "server", chatViewKey: "draft-a" }}
    />,
  );
  await expect.element(input).toHaveValue("Keep this unsent prompt");
  await screen.rerender(
    <ChatWorkspace
      routeThreadRef={ref}
      routePane={{ routeKind: "draft", draftId: DraftId.make("draft-b"), chatViewKey: "draft-b" }}
    />,
  );
  await expect.element(screen.getByRole("textbox")).toHaveValue("");
});
