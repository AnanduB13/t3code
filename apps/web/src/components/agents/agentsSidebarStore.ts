import { create } from "zustand";

export type AgentsSection = "tasks" | "chats";
export type AgentsTaskFilter = "active" | "all";

interface AgentsSidebarState {
  readonly section: AgentsSection;
  readonly selectedTaskId: string | null;
  readonly selectedSessionId: string | null;
  readonly taskFilter: AgentsTaskFilter;
  setSection: (section: AgentsSection) => void;
  setSelectedTaskId: (taskId: string | null) => void;
  setSelectedSessionId: (sessionId: string | null) => void;
  setTaskFilter: (filter: AgentsTaskFilter) => void;
}

export const useAgentsSidebarStore = create<AgentsSidebarState>((set) => ({
  section: "tasks",
  selectedTaskId: null,
  selectedSessionId: null,
  taskFilter: "active",
  setSection: (section) => set({ section }),
  setSelectedTaskId: (selectedTaskId) => set({ selectedTaskId }),
  setSelectedSessionId: (selectedSessionId) => set({ selectedSessionId }),
  setTaskFilter: (taskFilter) => set({ taskFilter }),
}));
