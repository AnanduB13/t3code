import { create } from "zustand";

export type AgentsSection = "tasks" | "chats";

interface AgentsSidebarState {
  readonly section: AgentsSection;
  readonly selectedTaskId: string | null;
  readonly selectedSessionId: string | null;
  setSection: (section: AgentsSection) => void;
  setSelectedTaskId: (taskId: string | null) => void;
  setSelectedSessionId: (sessionId: string | null) => void;
}

export const useAgentsSidebarStore = create<AgentsSidebarState>((set) => ({
  section: "tasks",
  selectedTaskId: null,
  selectedSessionId: null,
  setSection: (section) => set({ section }),
  setSelectedTaskId: (selectedTaskId) => set({ selectedTaskId }),
  setSelectedSessionId: (selectedSessionId) => set({ selectedSessionId }),
}));
