// @effect-diagnostics nodeBuiltinImport:off - exercises the installed list bundles without loading a client runtime.
import * as NodeFS from "node:fs";
import * as NodeVM from "node:vm";
import { describe, expect, it, vi } from "vite-plus/test";

function createList(bundle: string) {
  const source = NodeFS.readFileSync(
    new URL(`../apps/web/node_modules/@legendapp/list/${bundle}`, import.meta.url),
    "utf8",
  );
  const start = source.indexOf("function doMaintainScrollAtEnd(");
  const end = source.indexOf("// src/utils/requestAdjust.ts", start);
  const frames: Array<() => void> = [];
  const scrollToEnd = vi.fn();
  const state = {
    props: {
      maintainScrollAtEnd: { animated: true } as false | { animated: boolean },
      horizontal: false,
    },
    didContainersLayout: true,
    pendingNativeMVCPAdjust: undefined,
    pendingMaintainScrollAtEnd: false,
    maintainingScrollAtEnd: undefined as string | undefined,
    refScroller: { current: { scrollToEnd } },
    scroll: 1200,
    scrollLength: 800,
  };
  const maintain = NodeVM.runInNewContext(`${source.slice(start, end)}\ndoMaintainScrollAtEnd`, {
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    setTimeout: vi.fn(),
    getContentSize: () => 2000,
    getContentInsetStartAdjustment: () => 0,
    isHorizontalRTL: () => false,
    peek$: () => true,
  }) as (ctx: { state: typeof state }) => boolean;
  return {
    state,
    scrollToEnd,
    maintain: () => maintain({ state }),
    advance: () => frames.splice(0).forEach((frame) => frame()),
  };
}

for (const bundle of [
  "react.js",
  "react.mjs",
  "react-native.js",
  "react-native.mjs",
  "react-native.web.js",
  "react-native.web.mjs",
]) {
  describe(`queued end-follow (${bundle})`, () => {
    it("discards an automatic scroll when the reader pauses follow before the next frame", () => {
      const list = createList(bundle);
      list.maintain();
      // Another streaming layout can request follow while the first frame is pending.
      list.maintain();
      list.state.props.maintainScrollAtEnd = false;
      list.advance();
      expect(list.scrollToEnd).not.toHaveBeenCalled();
      expect(list.state.maintainingScrollAtEnd).toBeUndefined();
      expect(list.state.pendingMaintainScrollAtEnd).toBe(false);
    });

    it("lets even a small upward scroll escape the broad end-follow threshold", () => {
      const list = createList(bundle);
      list.maintain();
      list.state.scroll -= 10;
      list.advance();
      expect(list.scrollToEnd).not.toHaveBeenCalled();
      expect(list.state.maintainingScrollAtEnd).toBeUndefined();
    });

    it("keeps following streaming growth when the reader stays at the live edge", () => {
      const list = createList(bundle);
      list.maintain();
      list.advance();
      expect(list.scrollToEnd).toHaveBeenCalledWith({ animated: true });
    });

    it("allows a scroll toward the end to finish", () => {
      const list = createList(bundle);
      list.maintain();
      list.state.scroll += 10;
      list.advance();
      expect(list.scrollToEnd).toHaveBeenCalledTimes(1);
    });

    it("can resume following after a cancelled request", () => {
      const list = createList(bundle);
      list.maintain();
      list.state.props.maintainScrollAtEnd = false;
      list.advance();
      list.scrollToEnd.mockClear();
      list.state.props.maintainScrollAtEnd = { animated: true };
      list.maintain();
      list.advance();
      expect(list.scrollToEnd).toHaveBeenCalledTimes(1);
    });
  });
}
