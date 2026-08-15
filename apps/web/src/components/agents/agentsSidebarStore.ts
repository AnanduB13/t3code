import { create } from "zustand";

export type AgentsTaskFilter = "active" | "all";

interface AgentsSidebarState {
  readonly selectedTaskId: string | null;
  readonly selectedSessionId: string | null;
  readonly taskFilter: AgentsTaskFilter;
  setSelectedTaskId: (taskId: string | null) => void;
  setSelectedSessionId: (sessionId: string | null) => void;
  setTaskFilter: (filter: AgentsTaskFilter) => void;
}

export const useAgentsSidebarStore = create<AgentsSidebarState>((set) => ({
  selectedTaskId: null,
  selectedSessionId: null,
  taskFilter: "active",
  setSelectedTaskId: (selectedTaskId) => set({ selectedTaskId }),
  setSelectedSessionId: (selectedSessionId) => set({ selectedSessionId }),
  setTaskFilter: (taskFilter) => set({ taskFilter }),
}));
