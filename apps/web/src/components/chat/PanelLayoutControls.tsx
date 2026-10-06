import {
  BellIcon,
  Globe2Icon,
  PanelBottomIcon,
  PanelRightIcon,
  PanelsTopLeftIcon,
  SquareMenuIcon,
} from "lucide-react";
import { Maximize2, Minimize2 } from "lucide";
import { MorphIcon } from "~/components/MorphIcon";
import { memo, type ReactElement } from "react";

import type { ThreadPanelPresentation } from "../../rightPanelLayout";
import { ActivityCenter } from "../ActivityCenter";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { PopoverCreateHandle, PopoverTrigger } from "../ui/popover";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const noop = () => undefined;

export interface PanelLayoutControlsProps {
  activityCenterActive?: boolean;
  showThreadPanelControl?: boolean;
  showTerminalControl?: boolean;
  showRightPanelControl?: boolean;
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalShortcutLabel: string | null;
  browserAvailable?: boolean;
  browserOpen?: boolean;
  threadPanelOpen: boolean;
  threadPanelPresentation: ThreadPanelPresentation;
  threadPanelPopoverHandle?: ReturnType<typeof PopoverCreateHandle>;
  threadPanelShortcutLabel: string | null;
  threadPanelHasAttention: boolean;
  rightPanelAvailable: boolean;
  rightPanelOpen: boolean;
  rightPanelShortcutLabel: string | null;
  rightPanelUnavailableLabel?: string;
  onToggleTerminal: () => void;
  onToggleBrowser?: () => void;
  onToggleThreadPanel: () => void;
  onToggleRightPanel: () => void;
  chatPaneCount?: number | undefined;
  chatLayoutColumns?: number | undefined;
  onSetChatLayout?: ((count: number, columns: number) => void) | undefined;
}

export const PanelLayoutControls = memo(function PanelLayoutControls({
  activityCenterActive = true,
  showThreadPanelControl = true,
  showTerminalControl = true,
  showRightPanelControl = true,
  terminalAvailable,
  terminalOpen,
  terminalShortcutLabel,
  browserAvailable = false,
  browserOpen = false,
  threadPanelOpen,
  threadPanelPresentation,
  threadPanelPopoverHandle,
  threadPanelShortcutLabel,
  threadPanelHasAttention,
  rightPanelAvailable,
  rightPanelOpen,
  rightPanelShortcutLabel,
  rightPanelUnavailableLabel = "Right panel is unavailable",
  onToggleTerminal,
  onToggleBrowser = noop,
  onToggleThreadPanel,
  onToggleRightPanel,
  chatPaneCount,
  chatLayoutColumns,
  onSetChatLayout,
}: PanelLayoutControlsProps) {
  const threadPanelToggle = (
    <Toggle
      className="relative shrink-0 [-webkit-app-region:no-drag]"
      pressed={threadPanelOpen}
      aria-label="Toggle thread details panel"
      variant="ghost"
      size="sm"
    >
      <SquareMenuIcon className="size-4" />
      {threadPanelHasAttention ? (
        <span
          className="absolute right-1 top-1 size-1.5 rounded-full bg-warning ring-2 ring-background"
          aria-hidden="true"
        />
      ) : null}
    </Toggle>
  );
  const threadPanelTooltip = (trigger: ReactElement) => (
    <Tooltip>
      <TooltipTrigger
        render={trigger}
        {...(threadPanelPresentation === "popover" ? {} : { onClick: onToggleThreadPanel })}
      />
      <TooltipPopup side="bottom">
        Toggle thread details
        {threadPanelShortcutLabel ? ` (${threadPanelShortcutLabel})` : ""}
      </TooltipPopup>
    </Tooltip>
  );

  return (
    <div
      className="flex h-full shrink-0 items-center gap-1 [-webkit-app-region:no-drag]"
      data-panel-layout-controls
    >
      {showThreadPanelControl
        ? threadPanelPresentation === "popover"
          ? threadPanelTooltip(
              <PopoverTrigger handle={threadPanelPopoverHandle} render={threadPanelToggle} />,
            )
          : threadPanelTooltip(threadPanelToggle)
        : null}
      {showTerminalControl ? (
        <Tooltip>
          <TooltipTrigger render={<span className="flex shrink-0" />}>
            <Toggle
              className="shrink-0 [-webkit-app-region:no-drag]"
              pressed={terminalOpen}
              onPressedChange={onToggleTerminal}
              aria-label="Toggle terminal drawer"
              variant="ghost"
              size="sm"
              disabled={!terminalAvailable}
            >
              <PanelBottomIcon className="size-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {terminalAvailable
              ? `Toggle terminal drawer${terminalShortcutLabel ? ` (${terminalShortcutLabel})` : ""}`
              : "Terminal drawer is unavailable"}
          </TooltipPopup>
        </Tooltip>
      ) : null}
      {/* Chat layout, Activity Center, and the browser travel with the right panel toggle so a
          thread-panel-only instance never duplicates them. */}
      {showRightPanelControl ? (
        <>
          {onSetChatLayout ? (
            <Menu>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <MenuTrigger
                      render={
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="shrink-0"
                          aria-label={`Chat layout, ${chatPaneCount ?? 1} panes`}
                        />
                      }
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
        </>
      ) : null}
      {showRightPanelControl ? (
        <Tooltip>
          <TooltipTrigger render={<span className="flex shrink-0" />}>
            <Toggle
              className="shrink-0 [-webkit-app-region:no-drag]"
              pressed={rightPanelOpen}
              onPressedChange={onToggleRightPanel}
              aria-label="Toggle right panel"
              variant="ghost"
              size="sm"
              disabled={!rightPanelAvailable}
            >
              <PanelRightIcon className="size-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {rightPanelAvailable
              ? `Toggle right panel${rightPanelShortcutLabel ? ` (${rightPanelShortcutLabel})` : ""}`
              : rightPanelUnavailableLabel}
          </TooltipPopup>
        </Tooltip>
      ) : null}
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
            <MorphIcon className="size-4" icon={maximized ? Minimize2 : Maximize2} />
          </Toggle>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
});
