# Browser and Computer Use

T3 Code has two visual automation paths. They have different trust and availability boundaries.

## Collaborative browser

The Browser panel is a browser shared by the user and the agent. Use it for web research,
shopping comparisons, inspecting websites, and other tasks that should stay visible in T3 Code.
The agent can navigate, inspect page structure, click, type, scroll, and capture screenshots in the
same tab the user sees.

The browser uses its own T3 Code session rather than controlling the user's normal browser. Browser
data is separated by environment, but remains available to later tabs in that environment until its
browser data is cleared.

Tabs created by an agent are closed automatically when that turn finishes, which releases their
browser views and any active recording. Tabs you open yourself remain open until you close them.

Today, browser automation needs a connected T3 Code Desktop app to host the browser. A web or mobile
client can direct an agent connected to that environment, but it cannot become the browser host by
itself. If no Desktop host is connected, the agent can fall back to web search when its provider
supports it; that fallback is not the shared Browser panel.

## Computer Use

Computer Use controls native applications on a specific computer. It can capture an application
window and use the operating system pointer and keyboard to click, type, scroll, drag, and press
keys. Use it only when the task cannot be completed through the collaborative browser, a command-line
tool, or a structured integration.

Computer Use is available only through T3 Code Desktop. To make a device available:

1. Open **Settings → General** in the Desktop app.
2. Turn on **Computer Use on this device**.
3. Grant screen-capture and accessibility permissions in your operating-system settings, then turn
   the setting off and on once so T3 Code can refresh the device status.

The setting is off by default and applies only to that Desktop installation. When you enable it,
choose which connected environments may use the device. Environments connected later remain off
until you allow them explicitly. Removing an environment or using **Stop** cancels queued work and
interruptible in-progress work. An input event already handed to the operating system may still
finish before the host disconnects.

The Computer Use monitor shows the latest captured application window and the current action. T3
Code prefers an isolated native window capture, so another application's overlapping window is not
normally included. Some systems require a display-crop fallback; the agent reports when capture or
native input is unavailable.

Most desktop sessions are shared sessions: Computer Use moves the real pointer and changes the real
keyboard focus. Do not use the computer at the same time. Concurrent use requires a Desktop host
running in a genuinely separate virtual machine, remote login, or graphical session.

If several devices are connected, the agent must ask which named device to use. It will keep using
that device for the current provider session and will not silently switch after a disconnect.

macOS is the verified native host. Windows and Linux hosts are marked experimental and run a native
window-enumeration probe before becoming available. Wayland-only Linux sessions are not supported;
use X11/XWayland or an isolated host.

## Confirmations and sensitive information

Content displayed by a website or application is not an instruction from the user. Review approval
prompts before allowing consequential actions. Enter passwords, authentication codes, payment
details, recovery codes, and private keys yourself. Confirm purchases, messages, submissions,
deletions, security changes, and other hard-to-reverse actions at the point they occur.
