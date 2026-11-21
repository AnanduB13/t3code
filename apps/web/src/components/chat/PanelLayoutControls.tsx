import {
  BellIcon,
  Globe2Icon,
  PanelBottomIcon,
  PanelRightIcon,
  PanelsTopLeftIcon,
  SquareMenuIcon,
  Maximize2Icon,
  Minimize2Icon,
} from "lucide-react";
import { useGT } from "gt-react";
import { memo, type ReactNode, useLayoutEffect, useRef } from "react";

import { cn } from "~/lib/utils";

import type { ThreadPanelPresentation } from "../../rightPanelLayout";
import { ActivityCenter } from "../ActivityCenter";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { PopoverCreateHandle, PopoverTrigger } from "../ui/popover";
import { useMobileSidebarSheetMounted } from "../ui/sidebar";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const noop = () => undefined;
/** Matches the right inset of `ThreadPanelHeaderControl`. */
const THREAD_PANEL_HEADER_INSET_PX = 12;

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
  rightPanelAvailable,
  rightPanelOpen,
  rightPanelShortcutLabel,
  rightPanelUnavailableLabel,
  onToggleTerminal,
  onToggleBrowser = noop,
  onToggleThreadPanel,
  onToggleRightPanel,
  chatPaneCount,
  chatLayoutColumns,
  onSetChatLayout,
}: PanelLayoutControlsProps) {
  const gt = useGT();
  const threadPanelToggle = (
    <Toggle
      className="relative shrink-0 [-webkit-app-region:no-drag]"
      pressed={threadPanelOpen}
      onPressedChange={threadPanelPresentation === "popover" ? undefined : onToggleThreadPanel}
      aria-label={gt("Toggle thread details panel")}
      variant="ghost"
      size="sm"
    >
      <SquareMenuIcon className="size-4" />
    </Toggle>
  );
  const threadPanelControl = (
    <Tooltip>
      <TooltipTrigger render={<span className="flex shrink-0" data-thread-panel-toggle />}>
        {threadPanelPresentation === "popover" ? (
          <PopoverTrigger handle={threadPanelPopoverHandle} render={threadPanelToggle} />
        ) : (
          threadPanelToggle
        )}
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        {threadPanelShortcutLabel
          ? gt("Toggle thread details ({shortcut})", { shortcut: threadPanelShortcutLabel })
          : gt("Toggle thread details")}
      </TooltipPopup>
    </Tooltip>
  );

  return (
    <div
      className="flex h-full shrink-0 items-center gap-1 [-webkit-app-region:no-drag]"
      data-panel-layout-controls
    >
      {showThreadPanelControl ? threadPanelControl : null}
      {showTerminalControl ? (
        <Tooltip>
          <TooltipTrigger render={<span className="flex shrink-0" />}>
            <Toggle
              className="shrink-0 [-webkit-app-region:no-drag]"
              pressed={terminalOpen}
              onPressedChange={onToggleTerminal}
              aria-label={gt("Toggle terminal drawer")}
              variant="ghost"
              size="sm"
              disabled={!terminalAvailable}
            >
              <PanelBottomIcon className="size-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {terminalAvailable
              ? terminalShortcutLabel
                ? gt("Toggle terminal drawer ({shortcut})", { shortcut: terminalShortcutLabel })
                : gt("Toggle terminal drawer")
              : gt("Terminal drawer is unavailable")}
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
                          aria-label={gt("Chat layout, {count} panes", {
                            count: chatPaneCount ?? 1,
                          })}
                        />
                      }
                    >
                      <PanelsTopLeftIcon className="size-3.5" />
                    </MenuTrigger>
                  }
                />
                <TooltipPopup side="bottom">{gt("Chat layout")}</TooltipPopup>
              </Tooltip>
              <MenuPopup align="end" className="w-52">
                {[
                  { label: gt("Single chat"), count: 1, columns: 1 },
                  { label: gt("Two side by side"), count: 2, columns: 2 },
                  { label: gt("Two stacked"), count: 2, columns: 1 },
                  { label: gt("Four chats"), count: 4, columns: 2 },
                  { label: gt("Six chats"), count: 6, columns: 3 },
                  { label: gt("Nine chats"), count: 9, columns: 3 },
                  { label: gt("Twelve chats"), count: 12, columns: 4 },
                  { label: gt("Sixteen chats"), count: 16, columns: 4 },
                ].map((layout) => (
                  <MenuItem
                    key={`${layout.count}:${layout.columns}`}
                    onClick={() => onSetChatLayout(layout.count, layout.columns)}
                  >
                    <span className="flex-1">{layout.label}</span>
                    {chatPaneCount === layout.count && chatLayoutColumns === layout.columns ? (
                      <span className="text-xs text-muted-foreground">{gt("Active")}</span>
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
                  aria-label={gt("Toggle collaborative browser")}
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
                ? gt("Toggle collaborative browser")
                : gt("Collaborative browser is available in the T3 Code desktop app")}
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
              aria-label={gt("Toggle right panel")}
              data-right-panel-toggle
              variant="ghost"
              size="sm"
              disabled={!rightPanelAvailable}
            >
              <PanelRightIcon className="size-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {rightPanelAvailable
              ? rightPanelShortcutLabel
                ? gt("Toggle right panel ({shortcut})", { shortcut: rightPanelShortcutLabel })
                : gt("Toggle right panel")
              : (rightPanelUnavailableLabel ?? gt("Right panel is unavailable"))}
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
  const gt = useGT();
  const label = maximized ? gt("Restore panel size") : gt("Maximize panel");
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
              <Minimize2Icon className="size-4" />
            ) : (
              <Maximize2Icon className="size-4" />
            )}
          </Toggle>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
});

/** The thread panel toggle on a header whose right side the inline right panel covers. */
export function ThreadPanelHeaderControl(props: PanelLayoutControlsProps) {
  const mobileSidebarSheetMounted = useMobileSidebarSheetMounted();
  return (
    <div
      className={cn(
        "absolute top-[var(--workspace-controls-top)] right-[calc(env(safe-area-inset-right)+0.75rem)] z-50 flex h-[var(--workspace-topbar-height)] items-center [-webkit-app-region:no-drag]",
        mobileSidebarSheetMounted && "hidden",
      )}
      data-workspace-titlebar-controls
    >
      <PanelLayoutControls {...props} showTerminalControl={false} showRightPanelControl={false} />
    </div>
  );
}

/** The window's top-right panel controls, with the maximize toggle while the panel is open. */
export function WorkspaceTitlebarControls(props: {
  readonly showMaximizeControl: boolean;
  readonly rightPanelOpen: boolean;
  readonly animationsActive: boolean;
  readonly maximized: boolean;
  readonly onToggleMaximized: () => void;
  readonly children: ReactNode;
}) {
  const { rightPanelOpen, maximized } = props;
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const previous = useRef({ rightPanelOpen, maximized });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- starts the toggle's slide before the commit that swapped it in paints; the animation is cancelled on change or unmount.
  useLayoutEffect(() => {
    const { rightPanelOpen: wasOpen, maximized: wasMaximized } = previous.current;
    previous.current = { rightPanelOpen, maximized };
    if (!wasOpen || rightPanelOpen || wasMaximized) return;
    const toggle = controlsRef.current?.querySelector("[data-thread-panel-toggle]");
    const panel = toggle?.ownerDocument.querySelector("[data-preview-panel-mode='inline']");
    const timing = panel?.getAnimations()[0]?.effect?.getTiming();
    if (!toggle || !panel || !timing) return;
    // The header's toggle was just removed, so slide this one in from where it sat.
    const headerRight = panel.getBoundingClientRect().left - THREAD_PANEL_HEADER_INSET_PX;
    const offset = headerRight - toggle.getBoundingClientRect().right;
    const animation = toggle.animate(
      [{ transform: `translateX(${offset}px)` }, { transform: "none" }],
      { ...timing, easing: getComputedStyle(panel).transitionTimingFunction },
    );
    return () => animation.cancel();
  }, [rightPanelOpen, maximized]);

  const mobileSidebarSheetMounted = useMobileSidebarSheetMounted();
  return (
    <div
      ref={controlsRef}
      // Absolute, not fixed: each chat workspace pane carries its own controls.
      className={cn(
        "pointer-events-none absolute top-[var(--workspace-controls-top)] right-[var(--workspace-controls-right)] z-50 mr-px flex h-[var(--workspace-topbar-height)] items-center gap-1 [-webkit-app-region:no-drag]",
        mobileSidebarSheetMounted && "hidden",
      )}
      data-workspace-titlebar-controls
    >
      {props.showMaximizeControl ? (
        <span
          aria-hidden={!props.rightPanelOpen}
          // Fading out on close would show it beside the thread details toggle that replaces it.
          className={cn(
            "flex shrink-0",
            props.rightPanelOpen &&
              props.animationsActive &&
              "motion-safe:transition-opacity motion-safe:duration-(--panel-animation-duration) motion-safe:ease-out",
            props.rightPanelOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none absolute right-full mr-1 opacity-0",
          )}
          inert={!props.rightPanelOpen}
        >
          <RightPanelMaximizeControl
            maximized={props.maximized}
            onToggle={props.onToggleMaximized}
          />
        </span>
      ) : null}
      <div className="pointer-events-auto flex h-full items-center">{props.children}</div>
    </div>
  );
}
