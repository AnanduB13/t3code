import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useAgentsSidebarStore } from "./agentsSidebarStore";

/** Keeps the sidebar and workspace on the same computer, including while it reconnects. */
export function useAgentEnvironment() {
  const { environments } = useEnvironments();
  const primaryId = usePrimaryEnvironmentId();
  const selectedId = useAgentsSidebarStore((state) => state.environmentId);
  const environmentId = selectedId ?? primaryId ?? environments[0]?.environmentId ?? null;
  const environment = environments.find((entry) => entry.environmentId === environmentId) ?? null;
  return { environmentId, environment, environments };
}
