import { createFileRoute, redirect } from "@tanstack/react-router";

// Old After Dark links and bookmarks pointed at the separate scheduled jobs page.
export const Route = createFileRoute("/scheduled")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/scheduled-tasks", replace: true });
  },
});
