import { Link, useLocation } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import { BotIcon, CalendarClockIcon } from "lucide-react";

import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { useAgentsSidebarStore } from "./agentsSidebarStore";

export function AgentsSidebarLink() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const showOverview = useAgentsSidebarStore((state) => state.showOverview);
  const gt = useGT();

  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            render={<Link to="/agents" />}
            onClick={showOverview}
            isActive={pathname.startsWith("/agents")}
            tooltip={gt("Agents")}
            className="gap-2 px-2 text-muted-foreground data-[active=true]:text-foreground"
          >
            <BotIcon className="size-4" />
            <span>
              <T>Agents</T>
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            render={<Link to="/settings/scheduled-tasks" />}
            isActive={pathname.startsWith("/settings/scheduled-tasks")}
            tooltip={gt("Scheduled tasks")}
            className="gap-2 px-2 text-muted-foreground data-[active=true]:text-foreground"
          >
            <CalendarClockIcon className="size-4" />
            <span>
              <T>Scheduled</T>
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
