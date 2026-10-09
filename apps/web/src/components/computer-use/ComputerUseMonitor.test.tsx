import { expect, it } from "@effect/vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ComputerUseMonitor } from "./ComputerUseMonitor";

it("renders the captured application screenshot and isolated virtual pointer", () => {
  const markup = renderToStaticMarkup(
    <ComputerUseMonitor
      onStop={() => undefined}
      state={{
        deviceLabel: "Mac Studio",
        sessionIsolation: "isolated",
        phase: "acting",
        operation: "click",
        app: "Settings",
        pointer: { xPercent: 25, yPercent: 40, operation: "click", sequence: 1 },
        observation: {
          app: "Settings",
          windowId: "window-1",
          observationId: "observation-1",
          text: "",
          elements: [],
          navigation: { focusedElementIndex: null, interactiveElementIndices: [] },
          coordinateSpace: {
            kind: "window-screenshot",
            screenX: 0,
            screenY: 0,
            logicalWidth: 400,
            logicalHeight: 300,
            screenshotWidth: 800,
            screenshotHeight: 600,
            scaleX: 2,
            scaleY: 2,
          },
          screenshot: { mimeType: "image/png", data: "cG5n", width: 800, height: 600 },
        },
      }}
    />,
  );

  expect(markup).toContain("Computer Use · Mac Studio");
  expect(markup).toContain("data:image/png;base64,cG5n");
  expect(markup).toContain("computer-use-virtual-pointer");
  expect(markup).toContain("Isolated session · 800×600");
});
