// @vitest-environment jsdom

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useLocation,
} from "@tanstack/react-router";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { SidebarProvider } from "../ui/sidebar";
import { SettingsSidebarNav } from "./SettingsSidebarNav";
import { SettingsPageContainer, SettingsSearchTarget } from "./settingsLayout";
import { SETTINGS_SEARCH_ITEMS } from "./settingsSearch";
import { retainSettingsScope, validateSettingsRouteSearch } from "./settingsScopeNavigation";

vi.mock("../sidebar/SidebarChrome", () => ({ SidebarUtilityMenu: () => null }));
vi.mock("../clerk/T3ConnectSidebarSignIn", () => ({
  T3ConnectSidebarSignIn: () => null,
  T3ConnectSidebarAvatar: () => null,
}));
vi.mock("../ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("./useAvailableSettingsSearchItems", () => ({
  useAvailableSettingsSearchItems: () => SETTINGS_SEARCH_ITEMS,
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  HTMLElement.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openSettings() {
  const app = createRootRoute({
    component: () => {
      const pathname = useLocation({ select: (location) => location.pathname });
      return (
        <SidebarProvider>
          <SettingsSidebarNav pathname={pathname} />
          <Outlet />
        </SidebarProvider>
      );
    },
  });
  const settings = createRoute({
    getParentRoute: () => app,
    path: "settings",
    validateSearch: validateSettingsRouteSearch,
    search: { middlewares: [retainSettingsScope] },
  });
  const sections = ["general", "appearance", "integrations"].map((path) =>
    createRoute({
      getParentRoute: () => settings,
      path,
      component: () => (
        <SettingsPageContainer>
          <p data-section>{path}</p>
          {path === "integrations" ? (
            <SettingsSearchTarget id="device-hub">Device hub</SettingsSearchTarget>
          ) : null}
        </SettingsPageContainer>
      ),
    }),
  );
  const router = createRouter({
    routeTree: app.addChildren([settings.addChildren(sections)]),
    history: createMemoryHistory({ initialEntries: ["/settings/general?machine=remote"] }),
  });
  await router.load();
  await act(() => root.render(<RouterProvider router={router} />));
  return router;
}

async function clickSection(label: string) {
  const control = Array.from(
    container.querySelectorAll<HTMLElement>('[data-sidebar="menu-button"]'),
  ).find((node) => node.textContent === label);
  expect(control).toBeDefined();
  await act(() => control!.click());
}

it("switches sections and supports Back and Forward while keeping the selected environment", async () => {
  const router = await openSettings();
  await clickSection("Appearance");
  expect(container.querySelector("[data-section]")?.textContent).toBe("appearance");
  await clickSection("Integrations");
  expect(container.querySelector("[data-section]")?.textContent).toBe("integrations");
  expect(router.state.location.search).toEqual({ machine: "remote" });

  await act(async () => {
    router.history.back();
    await router.load();
  });
  expect(container.querySelector("[data-section]")?.textContent).toBe("appearance");
  expect(router.state.location.search).toEqual({ machine: "remote" });

  await act(async () => {
    router.history.forward();
    await router.load();
  });
  expect(container.querySelector("[data-section]")?.textContent).toBe("integrations");
});

it("offers one device hub search result and navigates to it without losing section history", async () => {
  const router = await openSettings();
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Search settings"]')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      "device hub",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const matches = Array.from(container.querySelectorAll<HTMLElement>('[role="option"]')).filter(
    (node) => node.textContent?.startsWith("Device hub"),
  );
  expect(matches).toHaveLength(1);
  await act(() => matches[0]!.click());
  expect(container.querySelector("[data-section]")?.textContent).toBe("integrations");
  expect(document.activeElement?.id).toBe("device-hub");
  expect(router.state.location.hash).toBe("");
  expect(router.state.location.search).toEqual({ machine: "remote" });

  await act(async () => {
    router.history.back();
    await router.load();
  });
  expect(container.querySelector("[data-section]")?.textContent).toBe("general");

  await clickSection("Appearance");
  expect(container.querySelector("[data-section]")?.textContent).toBe("appearance");
});
