// @effect-diagnostics nodeBuiltinImport:off -- Read AppKit display geometry through the system JXA bridge.
import * as NodeChildProcess from "node:child_process";
import * as Schema from "effect/Schema";

const MacScreenNotch = Schema.Struct({
  displayId: Schema.Finite,
  x: Schema.Finite,
  width: Schema.Finite.check(Schema.isGreaterThan(0)),
  height: Schema.Finite.check(Schema.isGreaterThan(0)),
});
export type MacScreenNotch = typeof MacScreenNotch.Type;
const decodeNotches = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Array(MacScreenNotch)));

// Work-area insets depend on menu-bar settings. AppKit's auxiliary areas describe
// the camera cutout itself, in points, even when the menu bar is hidden.
const SCREEN_NOTCH_SCRIPT = `
ObjC.import("AppKit");
$.NSApplication.sharedApplication.setActivationPolicy($.NSApplicationActivationPolicyProhibited);
function run() {
  const screens = $.NSScreen.screens;
  const notches = [];
  for (let i = 0; i < screens.count; i++) {
    const screen = screens.objectAtIndex(i);
    if (!screen.respondsToSelector("safeAreaInsets") || screen.safeAreaInsets.top <= 0) continue;
    const frame = screen.frame;
    const left = screen.auxiliaryTopLeftArea;
    const right = screen.auxiliaryTopRightArea;
    const edge = left.origin.x + left.size.width;
    notches.push({
      displayId: screen.deviceDescription.objectForKey("NSScreenNumber").js,
      x: edge - frame.origin.x,
      width: right.origin.x - edge,
      height: screen.safeAreaInsets.top
    });
  }
  return JSON.stringify(notches);
}`;

/** Query once per display configuration; no polling or screen-control permissions. */
export function readMacScreenNotches(): Promise<readonly MacScreenNotch[]> {
  return new Promise((resolve) => {
    NodeChildProcess.execFile(
      "/usr/bin/osascript",
      ["-l", "JavaScript", "-e", SCREEN_NOTCH_SCRIPT],
      { timeout: 5_000, maxBuffer: 16_384 },
      (error, stdout) => {
        if (error) return resolve([]);
        try {
          resolve(decodeNotches(stdout));
        } catch {
          resolve([]);
        }
      },
    );
  });
}
