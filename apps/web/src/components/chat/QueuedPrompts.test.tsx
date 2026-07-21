import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { QueuedPrompts } from "./QueuedPrompts";

describe("QueuedPrompts", () => {
  it("renders queued messages in order with explicit steer and remove actions", () => {
    const markup = renderToStaticMarkup(
      <QueuedPrompts
        prompts={[
          { id: "first", label: "Check the failing tests" },
          { id: "second", label: "Then update the docs" },
        ]}
        onSteer={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(markup.indexOf("Check the failing tests")).toBeLessThan(
      markup.indexOf("Then update the docs"),
    );
    expect(markup).toContain("Sends when the current turn finishes");
    expect(markup).toContain("Queued #2");
    expect(markup).toContain("Steer now with: Check the failing tests");
    expect(markup).toContain("Remove queued message: Check the failing tests");
  });

  it("renders nothing for an empty queue", () => {
    expect(
      renderToStaticMarkup(<QueuedPrompts prompts={[]} onSteer={vi.fn()} onRemove={vi.fn()} />),
    ).toBe("");
  });
});
