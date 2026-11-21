import { describe, expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render, type Screen } from "../test/render";
import { usePanelPresence } from "./panelAnimations";

vi.mock("./hooks/useSettings", () => ({ useClientSettings: vi.fn() }));

const surfaces = ["browser", "terminal"];

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

const shown = (screen: Screen) => screen.container.querySelector("span")?.textContent ?? null;
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("usePanelPresence", () => {
  it("opens with fresh panel data and retains the latest surface while closing", async () => {
    await using screen = await render(<Panel open />);
    using _timers = fakeTimers();
    expect(shown(screen)).toBe("browser");

    await screen.rerender(<Panel open activeSurface="terminal" />);
    expect(shown(screen)).toBe("terminal");

    await screen.rerender(<Panel open={false} />);
    expect(shown(screen)).toBe("terminal");
    await advance(200);
    expect(shown(screen)).toBeNull();
  });

  it("cancels closing when reopened and hides immediately without animations", async () => {
    await using screen = await render(<Panel open />);
    using _timers = fakeTimers();
    await screen.rerender(<Panel open={false} />);
    await advance(100);
    await screen.rerender(<Panel open activeSurface="terminal" />);
    await advance(200);
    expect(shown(screen)).toBe("terminal");

    await screen.rerender(<Panel open={false} animated={false} />);
    expect(shown(screen)).toBeNull();
  });

  it("does not retain another thread's panel during navigation", async () => {
    await using screen = await render(<Panel open />);
    await screen.rerender(<Panel open={false} scopeKey="thread-two" />);
    expect(shown(screen)).toBeNull();

    await screen.rerender(<Panel open scopeKey="thread-two" activeSurface="terminal" />);
    expect(shown(screen)).toBe("terminal");
  });
});
