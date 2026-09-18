import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId, TurnId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  openDiffFilePrimaryAction,
  openTurnDiffAction,
  resolveDiffPathForWorkspace,
} from "./diffFileActions";
import { selectThreadDiffPanelSelection, useDiffPanelStore } from "./diffPanelStore";
import { selectThreadRightPanelState, useRightPanelStore } from "./rightPanelStore";

const THREAD_REF = scopeThreadRef(
  EnvironmentId.make("environment-local"),
  ThreadId.make("thread-1"),
);

describe("openTurnDiffAction", () => {
  const turnId = TurnId.make("turn-1");
  const input = {
    threadRef: THREAD_REF,
    turnId,
    workspaceRoot: "/repo/frontend",
    repositoryRoot: "/repo",
  };

  beforeEach(() => {
    useRightPanelStore.setState({ byThreadKey: {} });
    useDiffPanelStore.setState({ byThreadKey: {} });
  });

  it.each(["features-coral-live.png", "screenshot.PNG", "diagram.svg"])(
    "replaces a previously opened file with the clicked image: %s",
    (name) => {
      useRightPanelStore.getState().openFile(THREAD_REF, "other.ts");
      openTurnDiffAction({ ...input, filePath: `frontend/output/${name}` });

      expect(
        selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, THREAD_REF),
      ).toMatchObject({ isOpen: true, activeSurfaceId: `file:output/${name}` });
    },
  );

  it("can return from an image preview to a selected text diff", () => {
    openTurnDiffAction({ ...input, filePath: "frontend/output/image.png" });
    openTurnDiffAction({ ...input, filePath: "frontend/app.ts" });

    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, THREAD_REF),
    ).toMatchObject({ isOpen: true, activeSurfaceId: "diff" });
    expect(
      selectThreadDiffPanelSelection(useDiffPanelStore.getState().byThreadKey, THREAD_REF),
    ).toMatchObject({ kind: "turn", turnId, filePath: "frontend/app.ts" });
  });

  it("opens the full turn diff without a file selection", () => {
    openTurnDiffAction({ ...input, filePath: "frontend/output/image.png" });
    openTurnDiffAction(input);

    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, THREAD_REF),
    ).toMatchObject({ isOpen: true, activeSurfaceId: "diff" });
    expect(
      selectThreadDiffPanelSelection(useDiffPanelStore.getState().byThreadKey, THREAD_REF),
    ).toMatchObject({ kind: "turn", turnId, filePath: null });
  });
});

describe("openDiffFilePrimaryAction", () => {
  beforeEach(() => {
    useRightPanelStore.setState({ byThreadKey: {} });
  });

  it("opens diff files in the thread file viewer", () => {
    const openInEditor = vi.fn();

    openDiffFilePrimaryAction({
      threadRef: THREAD_REF,
      filePath: "apps/web/src/components/DiffPanel.tsx",
      activeCwd: "/repo/project",
      openInEditor,
    });

    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, THREAD_REF),
    ).toMatchObject({
      isOpen: true,
      activeSurfaceId: "file:apps/web/src/components/DiffPanel.tsx",
    });
    expect(openInEditor).not.toHaveBeenCalled();
  });

  it("falls back to the editor without thread context", () => {
    const openInEditor = vi.fn();

    openDiffFilePrimaryAction({
      threadRef: null,
      filePath: "apps/web/src/components/DiffPanel.tsx",
      activeCwd: "/repo/project",
      openInEditor,
    });

    expect(openInEditor).toHaveBeenCalledWith(
      "/repo/project/apps/web/src/components/DiffPanel.tsx",
    );
  });

  it("opens repository-relative diff files from a nested project", () => {
    const openInEditor = vi.fn();

    openDiffFilePrimaryAction({
      threadRef: THREAD_REF,
      filePath: "frontend/Dockerfile",
      activeCwd: "/repo/frontend",
      repositoryRoot: "/repo",
      openInEditor,
    });

    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, THREAD_REF),
    ).toMatchObject({
      isOpen: true,
      activeSurfaceId: "file:Dockerfile",
    });
    expect(openInEditor).not.toHaveBeenCalled();
  });

  it("preserves repository-relative paths in a separate worktree", () => {
    expect(
      resolveDiffPathForWorkspace({
        filePath: "frontend/Dockerfile",
        workspaceRoot: "/worktrees/feature",
        repositoryRoot: "/repo",
      }),
    ).toBe("frontend/Dockerfile");
  });

  it("handles Windows roots and mixed diff separators", () => {
    expect(
      resolveDiffPathForWorkspace({
        filePath: "Frontend/src\\index.ts",
        workspaceRoot: "C:\\repo\\frontend",
        repositoryRoot: "C:\\repo",
      }),
    ).toBe("src/index.ts");
  });

  it.each([
    { workspaceRoot: "/frontend", repositoryRoot: "/" },
    { workspaceRoot: "C:\\frontend", repositoryRoot: "C:\\" },
  ])("handles filesystem roots: $repositoryRoot", ({ workspaceRoot, repositoryRoot }) => {
    expect(
      resolveDiffPathForWorkspace({
        filePath: "frontend/index.ts",
        workspaceRoot,
        repositoryRoot,
      }),
    ).toBe("index.ts");
  });

  it.each(["backend/server.ts", "frontend2/app.ts", "frontend/../secret.ts", "C:secret.ts"])(
    "does not open an out-of-project diff path: %s",
    (filePath) => {
      const openInEditor = vi.fn();

      openDiffFilePrimaryAction({
        threadRef: THREAD_REF,
        filePath,
        activeCwd: "/repo/frontend",
        repositoryRoot: "/repo",
        openInEditor,
      });

      expect(
        selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, THREAD_REF),
      ).toMatchObject({ isOpen: false });
      expect(openInEditor).not.toHaveBeenCalled();
    },
  );
});
