import { Link, useLocation } from "@tanstack/react-router";
import { BotIcon } from "lucide-react";

import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";

export function AgentsSidebarLink() {
  const active = useLocation({ select: (location) => location.pathname.startsWith("/agents") });

  return (
    <SidebarGroup className="px-2 py-1">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            render={<Link to="/agents" />}
            isActive={active}
            tooltip="Agents"
            className="gap-2 px-2 text-muted-foreground data-[active=true]:text-foreground"
          >
            <BotIcon className="size-4" />
            <span>Agents</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
