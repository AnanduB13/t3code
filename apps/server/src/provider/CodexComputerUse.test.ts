import * as NodeAssert from "node:assert/strict";

import { describe, it } from "vite-plus/test";

import {
  CODEX_COMPUTER_USE_PLUGIN_REFERENCE,
  prepareCodexInputForComputerUse,
} from "./CodexComputerUse.ts";

describe("prepareCodexInputForComputerUse", () => {
  it("activates the bundled plugin for explicit natural-language requests", () => {
    const input = "use computer use and open the ChatGPT app";

    NodeAssert.equal(
      prepareCodexInputForComputerUse(input),
      `${CODEX_COMPUTER_USE_PLUGIN_REFERENCE} ${input}`,
    );
  });

  it("activates automatically for clear native GUI tasks", () => {
    const inputs = [
      "Open the Settings app and enable dark mode",
      "Test the macOS app onboarding flow",
      "Launch System Settings and change the appearance",
    ];

    for (const input of inputs) {
      NodeAssert.equal(
        prepareCodexInputForComputerUse(input),
        `${CODEX_COMPUTER_USE_PLUGIN_REFERENCE} ${input}`,
      );
    }
  });

  it("expands the slash command at the provider boundary", () => {
    NodeAssert.equal(
      prepareCodexInputForComputerUse("/computer open Settings"),
      `${CODEX_COMPUTER_USE_PLUGIN_REFERENCE} open Settings`,
    );
  });

  it("does not duplicate an existing plugin activation", () => {
    const input = `${CODEX_COMPUTER_USE_PLUGIN_REFERENCE} open Settings`;
    NodeAssert.equal(prepareCodexInputForComputerUse(input), input);
  });

  it("does not activate for discussion or implementation requests", () => {
    const inputs = [
      "Explain how Computer Use works",
      "Implement the Computer Use feature",
      "Implement the macOS app onboarding feature",
      "Why did Computer Use fail?",
      "Use the CLI to update this file",
    ];

    for (const input of inputs) {
      NodeAssert.equal(prepareCodexInputForComputerUse(input), input);
    }
  });
});
