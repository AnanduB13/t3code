import { describe, expect, it } from "vite-plus/test";

import { mobileDockDestinationForPathname } from "./mobile-dock-navigation";

describe("mobileDockDestinationForPathname", () => {
  it.each([
    ["/", "chat"],
    ["/pull-requests", "pull-requests"],
    ["/settings/usage", "usage"],
    ["/settings", "settings"],
    ["/settings/appearance", "settings"],
  ] as const)("maps %s to %s", (pathname, destination) => {
    expect(mobileDockDestinationForPathname(pathname)).toBe(destination);
  });

  it.each([
    "/threads/environment/thread",
    "/threads/environment/thread/files",
    "/threads/environment/thread/review",
    "/new",
    "/new/draft",
    "/connections",
    "/agents",
    "/scheduled",
  ])("hides the dock on %s", (pathname) => {
    expect(mobileDockDestinationForPathname(pathname)).toBeNull();
  });
});
