import { createFileRoute, redirect } from "@tanstack/react-router";

import { HermesWorkspaceView } from "./agents";

export const Route = createFileRoute("/scheduled")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: () => <HermesWorkspaceView section="tasks" standaloneScheduled />,
});
