import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { usePanelPresence } from "./panelAnimations";

vi.mock("./hooks/useSettings", () => ({ useClientSettings: vi.fn() }));

const surfaces = ["browser", "terminal"];
let renderer: ReactTestRenderer | undefined;

function Panel({
  open,
  activeSurface = "browser",
  scopeKey = "thread-one",
  animated = true,
}: {
  open: boolean;
  activeSurface?: string;
  scopeKey?: string;
  animated?: boolean;
}) {
  const presence = usePanelPresence(open, { activeSurface, surfaces }, animated, scopeKey, 200);
  return presence.present ? <span>{presence.value?.activeSurface}</span> : null;
}

async function renderPanel(props: Parameters<typeof Panel>[0]) {
  await act(() => {
    if (renderer) renderer.update(<Panel {...props} />);
    else renderer = create(<Panel {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", globalThis);
  vi.useFakeTimers();
});

afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("usePanelPresence", () => {
  it("opens with fresh panel data and retains the latest surface while closing", async () => {
    await renderPanel({ open: true });
    expect(renderer?.toJSON()).toMatchObject({ children: ["browser"] });

    await renderPanel({ open: true, activeSurface: "terminal" });
    expect(renderer?.toJSON()).toMatchObject({ children: ["terminal"] });

    await renderPanel({ open: false });
    expect(renderer?.toJSON()).toMatchObject({ children: ["terminal"] });
    await act(() => vi.advanceTimersByTime(200));
    expect(renderer?.toJSON()).toBeNull();
  });

  it("cancels closing when reopened and hides immediately without animations", async () => {
    await renderPanel({ open: true });
    await renderPanel({ open: false });
    await act(() => vi.advanceTimersByTime(100));
    await renderPanel({ open: true, activeSurface: "terminal" });
    await act(() => vi.advanceTimersByTime(200));
    expect(renderer?.toJSON()).toMatchObject({ children: ["terminal"] });

    await renderPanel({ open: false, animated: false });
    expect(renderer?.toJSON()).toBeNull();
  });

  it("does not retain another thread's panel during navigation", async () => {
    await renderPanel({ open: true });
    await renderPanel({ open: false, scopeKey: "thread-two" });
    expect(renderer?.toJSON()).toBeNull();

    await renderPanel({ open: true, scopeKey: "thread-two", activeSurface: "terminal" });
    expect(renderer?.toJSON()).toMatchObject({ children: ["terminal"] });
  });
});
