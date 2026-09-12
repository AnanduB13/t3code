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

Input tools accept an optional `observeAfter: true`. The Desktop executor keeps input and its next
observation in the same serialized task, eliminating a separate model/tool round trip. The result
contains `actionCompleted: true` and either `observation` or `observationError`. An observation error
does not mean the input failed and must not cause a blind retry. If an action opens another window,
follow-up capture reports the focus change rather than stealing focus back. Older hosts can return
`null`; agents then observe separately. This contract is shared by every provider using the T3 MCP
endpoint, including agents directed from web or mobile clients.

Observations capture and encode one bounded PNG after a short settling interval, with accessibility
inspection in parallel. Already focused windows are not refocused. Window geometry comes from the
native provider rather than nut-js's primary-display-clipped `Window.region`, and is checked again
after focus and capture. Accessibility values are truncated to bound model context, and clipped or
off-window controls cannot produce out-of-window semantic click targets. MCP returns image bytes in
an image block and presents one text tree rather than duplicating it as a JSON element list.

Typing disables nut-js's default 300 ms per-character delay and checks cancellation between Unicode
code points. Keyboard shortcuts and drags release held input in `finally`. Scrolling targets the
window center unless coordinates identify a particular pane; deltas are native wheel steps.

Desktop input is serialized because a graphical login has one foreground focus and pointer.
Installation-scoped random device IDs avoid ambiguous routing between machines with the same host
name. The visible host monitor is telemetry; its pointer does not create a second operating-system
cursor. Broker timeouts, host disconnection, environment deauthorization, and the monitor's Stop
action cancel queued work and abort interruptible in-flight waits. An operating-system input call is
still atomic once dispatched.

The renderer and native executor share a cancellation-aware queue implementation. Cancellation
prevents renderer-queued work from reaching IPC, while stream failure or replacement cancels the
old connection's active work and suppresses late responses. Reconnection fails old broker requests
immediately. Automatic device selection becomes sticky on the first invocation, and listing devices
continues reporting a selected disconnected device rather than implying a silent replacement.

Focused adapter tests cover native call ordering, capture count, typing cancellation, held-input
cleanup, and secondary-monitor coordinates. MCP integration tests cover broker routing and image
responses. These tests use mocked OS calls; actual capture latency, application compatibility, and
background operation require separate verification on real Desktop hosts.

Cursor movement uses at most eight position updates over a path capped at 120 ms, yielding between
updates so cancellation can run. It avoids nut-js's per-pixel busy-wait movement implementation,
which otherwise occupies Electron's main thread while the cursor travels.

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
