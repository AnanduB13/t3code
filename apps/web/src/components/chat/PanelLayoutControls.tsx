import {
  BellIcon,
  Globe2Icon,
  Maximize2Icon,
  Minimize2Icon,
  PanelBottomIcon,
  PanelRightIcon,
  PanelsTopLeftIcon,
} from "lucide-react";
import { memo } from "react";

import { ActivityCenter } from "../ActivityCenter";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface PanelLayoutControlsProps {
  activityCenterActive?: boolean;
  showTerminalControl?: boolean;
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalShortcutLabel: string | null;
  browserAvailable: boolean;
  browserOpen: boolean;
  rightPanelAvailable: boolean;
  rightPanelOpen: boolean;
  rightPanelShortcutLabel: string | null;
  /** Running + waiting subagents in this thread; badges the right panel toggle. */
  liveAgentCount: number;
  onToggleTerminal: () => void;
  onToggleBrowser: () => void;
  onToggleRightPanel: () => void;
  chatPaneCount?: number | undefined;
  chatLayoutColumns?: number | undefined;
  onSetChatLayout?: ((count: number, columns: number) => void) | undefined;
}

export const PanelLayoutControls = memo(function PanelLayoutControls({
  activityCenterActive = true,
  showTerminalControl = true,
  terminalAvailable,
  terminalOpen,
  terminalShortcutLabel,
  browserAvailable,
  browserOpen,
  rightPanelAvailable,
  rightPanelOpen,
  rightPanelShortcutLabel,
  liveAgentCount,
  onToggleTerminal,
  onToggleBrowser,
  onToggleRightPanel,
  chatPaneCount,
  chatLayoutColumns,
  onSetChatLayout,
}: PanelLayoutControlsProps) {
  return (
    <div
      className="flex h-full shrink-0 items-center gap-1 [-webkit-app-region:no-drag]"
      data-panel-layout-controls
    >
      {showTerminalControl ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                className="shrink-0 [-webkit-app-region:no-drag]"
                pressed={terminalOpen}
                onPressedChange={onToggleTerminal}
                aria-label="Toggle terminal drawer"
                variant="ghost"
                size="sm"
                disabled={!terminalAvailable}
              >
                <PanelBottomIcon className="size-3.5" />
              </Toggle>
            }
          />
          <TooltipPopup side="bottom">
            {terminalAvailable
              ? `Toggle terminal drawer${terminalShortcutLabel ? ` (${terminalShortcutLabel})` : ""}`
              : "Terminal drawer is unavailable"}
          </TooltipPopup>
        </Tooltip>
      ) : null}
      {onSetChatLayout ? (
        <Menu>
          <Tooltip>
            <TooltipTrigger
              render={
                <MenuTrigger
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-sm hover:bg-muted"
                  aria-label={`Chat layout, ${chatPaneCount ?? 1} panes`}
                >
                  <PanelsTopLeftIcon className="size-3.5" />
                </MenuTrigger>
              }
            />
            <TooltipPopup side="bottom">Chat layout</TooltipPopup>
          </Tooltip>
          <MenuPopup align="end" className="w-52">
            {[
              { label: "Single chat", count: 1, columns: 1 },
              { label: "Two side by side", count: 2, columns: 2 },
              { label: "Two stacked", count: 2, columns: 1 },
              { label: "Four chats", count: 4, columns: 2 },
              { label: "Six chats", count: 6, columns: 3 },
              { label: "Nine chats", count: 9, columns: 3 },
              { label: "Twelve chats", count: 12, columns: 4 },
              { label: "Sixteen chats", count: 16, columns: 4 },
            ].map((layout) => (
              <MenuItem
                key={`${layout.count}:${layout.columns}`}
                onClick={() => onSetChatLayout(layout.count, layout.columns)}
              >
                <span className="flex-1">{layout.label}</span>
                {chatPaneCount === layout.count && chatLayoutColumns === layout.columns ? (
                  <span className="text-xs text-muted-foreground">Active</span>
                ) : null}
              </MenuItem>
            ))}
          </MenuPopup>
        </Menu>
      ) : null}
      {activityCenterActive ? (
        <ActivityCenter />
      ) : (
        <span
          aria-hidden
          className="inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground"
        >
          <BellIcon className="size-3.5" />
        </span>
      )}
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              className="shrink-0 [-webkit-app-region:no-drag]"
              pressed={browserOpen}
              onPressedChange={onToggleBrowser}
              aria-label="Toggle collaborative browser"
              variant="ghost"
              size="sm"
              disabled={!browserAvailable}
            >
              <Globe2Icon className="size-3.5" />
            </Toggle>
          }
        />
        <TooltipPopup side="bottom">
          {browserAvailable
            ? "Toggle collaborative browser"
            : "Collaborative browser is available in the T3 Code desktop app"}
        </TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              className="shrink-0 [-webkit-app-region:no-drag]"
              pressed={rightPanelOpen}
              onPressedChange={onToggleRightPanel}
              aria-label={
                liveAgentCount > 0
                  ? `Toggle right panel, ${liveAgentCount} ${liveAgentCount === 1 ? "agent" : "agents"} working`
                  : "Toggle right panel"
              }
              variant="ghost"
              size="sm"
              disabled={!rightPanelAvailable}
            >
              <PanelRightIcon className="size-3.5" />
              {liveAgentCount > 0 ? (
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-info px-1 text-[9px] font-semibold tabular-nums text-white"
                >
                  {liveAgentCount}
                </span>
              ) : null}
            </Toggle>
          }
        />
        <TooltipPopup side="bottom">
          {rightPanelAvailable
            ? `Toggle right panel${rightPanelShortcutLabel ? ` (${rightPanelShortcutLabel})` : ""}${
                liveAgentCount > 0
                  ? ` · ${liveAgentCount} ${liveAgentCount === 1 ? "agent" : "agents"} working`
                  : ""
              }`
            : "Right panel is unavailable"}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
});

export const RightPanelMaximizeControl = memo(function RightPanelMaximizeControl({
  maximized,
  onToggle,
}: {
  maximized: boolean;
  onToggle: () => void;
}) {
  const label = maximized ? "Restore panel size" : "Maximize panel";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            className="shrink-0 [-webkit-app-region:no-drag]"
            pressed={maximized}
            onPressedChange={onToggle}
            aria-label={label}
            variant="ghost"
            size="sm"
          >
            {maximized ? (
              <Minimize2Icon className="size-3.5" />
            ) : (
              <Maximize2Icon className="size-3.5" />
            )}
          </Toggle>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
});
