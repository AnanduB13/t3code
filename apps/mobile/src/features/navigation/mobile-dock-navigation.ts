export type MobileDockDestination = "chat" | "pull-requests" | "usage" | "settings";

/** The dock belongs to top-level browsing surfaces, never thread or composer flows. */
export function mobileDockDestinationForPathname(pathname: string): MobileDockDestination | null {
  if (pathname === "/" || pathname === "") {
    return "chat";
  }
  if (pathname === "/pull-requests" || pathname.startsWith("/pull-requests/")) {
    return "pull-requests";
  }
  if (pathname === "/settings/usage" || pathname.startsWith("/settings/usage/")) {
    return "usage";
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "settings";
  }
  return null;
}
