import { createFileRoute, redirect } from "@tanstack/react-router";

import { ScheduledJobsPage } from "../components/agents/ScheduledJobsPage";

export const Route = createFileRoute("/scheduled")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: ScheduledJobsPage,
});
