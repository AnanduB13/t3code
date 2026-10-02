import { Link, useLocation } from "@tanstack/react-router";
import { BotIcon, CalendarClockIcon } from "lucide-react";

import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { useAgentsSidebarStore } from "./agentsSidebarStore";

export function AgentsSidebarLink() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const showOverview = useAgentsSidebarStore((state) => state.showOverview);

  return (
    <SidebarGroup className="px-2 py-1">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            render={<Link to="/agents" />}
            onClick={showOverview}
            isActive={pathname.startsWith("/agents")}
            tooltip="Agents"
            className="gap-2 px-2 text-muted-foreground data-[active=true]:text-foreground"
          >
            <BotIcon className="size-4" />
            <span>Agents</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            render={<Link to="/scheduled" />}
            isActive={pathname.startsWith("/scheduled")}
            tooltip="Scheduled"
            className="gap-2 px-2 text-muted-foreground data-[active=true]:text-foreground"
          >
            <CalendarClockIcon className="size-4" />
            <span>Scheduled</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
