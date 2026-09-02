# Visual automation architecture

T3 Code intentionally has two visual automation boundaries.

## Collaborative browser

The preview toolset routes provider MCP calls through the server's preview broker to an
automation-capable Desktop renderer. The renderer owns an Electron webview, while the server owns
durable tab navigation state. Screenshots and structured page observations return through the same
request/response stream. The browser partition is persistent and scoped to an environment.

This is a collaborative browser host, not yet a server-hosted browser service. With no connected
Desktop renderer, web and mobile clients cannot create an automation-capable browser. They may still
receive provider-specific web-search results, but those results are not visible as a live shared tab.

## Native Computer Use

The computer toolset routes provider-scoped MCP calls through the Computer Use broker to an opted-in
Desktop host. Each Desktop installation explicitly selects which connected environments may use the
host. Device selection is sticky per environment and provider session. A host prefers native window
capture, falling back to a cropped display capture when the operating system cannot identify a safe
window source. It returns an accessibility hierarchy plus a bounded PNG and issues native input only
against a fresh, single-use observation.

Desktop input is serialized because a graphical login has one foreground focus and pointer.
Installation-scoped random device IDs avoid ambiguous routing between machines with the same host
name. The visible host monitor is telemetry; its pointer does not create a second operating-system
cursor. Broker timeouts, host disconnection, environment deauthorization, and the monitor's Stop
action cancel queued work and abort interruptible in-flight waits. An operating-system input call is
still atomic once dispatched.

## Known gaps

- A server-owned isolated browser/container is still required for shared-browser availability when
  no Desktop client is connected.
- Browser sessions persist per environment rather than creating an ephemeral storage partition for
  each task.
- Native capture falls back to cropping a display when a stable native window source cannot be
  matched. In that fallback, occluding windows can appear and a target spanning displays must be
  moved onto one display before it can be controlled.
- Cancellation cannot retract an input event already dispatched to the operating system.
- Per-application allow lists are not yet modeled. Implementing them requires stable OS application
  identities; window-title allow lists are deliberately avoided because titles change and are not a
  trustworthy authorization boundary.
- Native accessibility and input support is strongest on macOS. Windows and X11/XWayland require
  integrated verification before being described as fully supported. Hosts probe native window
  enumeration before advertising availability and report non-macOS support as experimental.
- Provider-native activation and approval behavior must be verified separately for Codex, Claude,
  Cursor, Grok, and OpenCode. The T3 MCP contract alone does not guarantee equivalent provider UX.

The next architectural step is a server-owned browser worker with bounded screenshot artifacts and a
client-visible event stream. It should reuse the existing preview contract where possible instead of
creating a third browser model.
