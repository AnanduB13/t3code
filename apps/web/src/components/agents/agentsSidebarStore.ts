import { create } from "zustand";
import type { EnvironmentId } from "@t3tools/contracts";

export type AgentsSection = "tasks" | "chats";
export type AgentsTaskFilter = "active" | "all";

interface AgentsSidebarState {
  readonly agentView: "overview" | "hermes";
  readonly environmentId: EnvironmentId | null;
  readonly section: AgentsSection;
  readonly selectedTaskId: string | null;
  readonly selectedSessionId: string | null;
  readonly taskFilter: AgentsTaskFilter;
  setSection: (section: AgentsSection) => void;
  setSelectedTaskId: (taskId: string | null) => void;
  setSelectedSessionId: (sessionId: string | null) => void;
  setTaskFilter: (filter: AgentsTaskFilter) => void;
  setEnvironmentId: (environmentId: EnvironmentId) => void;
  openHermes: (environmentId: EnvironmentId) => void;
  showOverview: () => void;
}

export const useAgentsSidebarStore = create<AgentsSidebarState>((set) => ({
  agentView: "overview",
  environmentId: null,
  section: "chats",
  selectedTaskId: null,
  selectedSessionId: null,
  taskFilter: "active",
  setSection: (section) => set({ section }),
  setSelectedTaskId: (selectedTaskId) => set({ selectedTaskId }),
  setSelectedSessionId: (selectedSessionId) => set({ selectedSessionId }),
  setTaskFilter: (taskFilter) => set({ taskFilter }),
  setEnvironmentId: (environmentId) =>
    set({ environmentId, selectedTaskId: null, selectedSessionId: null }),
  openHermes: (environmentId) =>
    set({
      environmentId,
      agentView: "hermes",
      section: "chats",
      selectedTaskId: null,
      selectedSessionId: null,
    }),
  showOverview: () => set({ agentView: "overview" }),
}));
