import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { describe, expect, it } from "vite-plus/test";

import { ElectronBrowserHost } from "./browser/ElectronBrowserHost";
import { AgentPreviewTurnCleanup } from "./components/preview/AgentPreviewTurnCleanup";
import { ComputerUseHosts } from "./components/computer-use/ComputerUseHosts";
import { QuitHoldOverlay } from "./components/QuitHoldOverlay";
import { I18nProvider } from "./i18n/I18nProvider";
import { AppAtomRegistryProvider } from "./rpc/atomRegistry";
import type { AppRouter } from "./router";
import { AppRoot } from "./AppRoot";

describe("AppRoot", () => {
  it("shares the application atom registry with routed UI and renderer-wide desktop hosts", () => {
    const root = AppRoot({ router: {} as AppRouter });

    expect(root.type).toBe(I18nProvider);
    const registry = (root as ReactElement<{ readonly children: ReactElement }>).props.children;
    expect(registry.type).toBe(AppAtomRegistryProvider);
    const children = Children.toArray(
      (registry as ReactElement<{ readonly children: ReactNode }>).props.children,
    );
    expect(children.map((child) => isValidElement(child) && child.type)).toEqual([
      RouterProvider,
      AgentPreviewTurnCleanup,
      ComputerUseHosts,
      ElectronBrowserHost,
      QuitHoldOverlay,
    ]);
  });
});
