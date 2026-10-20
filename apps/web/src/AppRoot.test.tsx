import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { describe, expect, it } from "vite-plus/test";

import { BrowserProfileReporter } from "./browser/BrowserProfileReporter";
import { ElectronBrowserHost } from "./browser/ElectronBrowserHost";
import { AgentPreviewTurnCleanup } from "./components/preview/AgentPreviewTurnCleanup";
import { ComputerUseHosts } from "./components/computer-use/ComputerUseHosts";
import { QuitHoldOverlay } from "./components/QuitHoldOverlay";
import { AppAtomRegistryProvider } from "./rpc/atomRegistry";
import type { AppRouter } from "./router";
import { AppRoot } from "./AppRoot";

describe("AppRoot", () => {
  it("shares the application atom registry with routed UI and renderer-wide desktop hosts", () => {
    const root = AppRoot({ router: {} as AppRouter });

    expect(root.type).toBe(AppAtomRegistryProvider);
    const children = Children.toArray(
      (root as ReactElement<{ readonly children: ReactNode }>).props.children,
    );
    expect(children.map((child) => isValidElement(child) && child.type)).toEqual([
      RouterProvider,
      AgentPreviewTurnCleanup,
      ComputerUseHosts,
      ElectronBrowserHost,
      BrowserProfileReporter,
      QuitHoldOverlay,
    ]);
  });
});
