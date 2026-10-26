import * as NodeAssert from "node:assert/strict";

import { describe, it } from "vite-plus/test";

import {
  CODEX_DEFAULT_AUTO_COMPACT_TOKEN_LIMIT,
  codexSessionAppServerArgs,
  codexAppServerArgs,
  codexExecLaunchArgs,
} from "./codexLaunchArgs.ts";

describe("codexAppServerArgs", () => {
  it("preserves escaped TOML quotes in config values", () => {
    NodeAssert.deepStrictEqual(
      codexAppServerArgs(String.raw`--config model=\"gpt-6.1-sol\" --strict-config`),
      ["app-server", "--config", 'model="gpt-6.1-sol"', "--strict-config"],
    );
  });
});

describe("codexSessionAppServerArgs", () => {
  it("compacts long-running sessions before their context becomes expensive", () => {
    NodeAssert.deepStrictEqual(codexSessionAppServerArgs(undefined, undefined), [
      "app-server",
      "-c",
      `model_auto_compact_token_limit=${CODEX_DEFAULT_AUTO_COMPACT_TOKEN_LIMIT}`,
    ]);
  });

  it("preserves an explicit auto-compact limit", () => {
    NodeAssert.deepStrictEqual(
      codexSessionAppServerArgs(undefined, "--config=model_auto_compact_token_limit=220000"),
      ["app-server", "--config=model_auto_compact_token_limit=220000"],
    );
  });

  it("detects an explicit limit in per-session app-server arguments", () => {
    NodeAssert.deepStrictEqual(
      codexSessionAppServerArgs(["-c", "model_auto_compact_token_limit=200000"], "--strict-config"),
      ["app-server", "--strict-config", "-c", "model_auto_compact_token_limit=200000"],
    );
  });
});

describe("codexExecLaunchArgs", () => {
  it("keeps shared codex flags and omits app-server-only flags", () => {
    NodeAssert.deepStrictEqual(
      codexExecLaunchArgs('--strict-config --enable foo --listen off --config model="gpt 5"'),
      ["--strict-config", "--enable", "foo", "--config", "model=gpt 5"],
    );
  });

  it("does not pair value-taking flags with adjacent flags", () => {
    NodeAssert.deepStrictEqual(codexExecLaunchArgs("--config --strict-config --enable --disable"), [
      "--strict-config",
    ]);
  });
});
