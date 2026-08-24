import * as NodeAssert from "node:assert/strict";

import { describe, it } from "vite-plus/test";

import {
  CODEX_DEFAULT_AUTO_COMPACT_TOKEN_LIMIT,
  codexAppServerArgs,
  codexExecLaunchArgs,
  codexSessionAppServerArgs,
  resolveCodexLaunchArgs,
} from "./codexLaunchArgs.ts";

describe("resolveCodexLaunchArgs", () => {
  it("uses T3CODE_CODEX_LAUNCH_ARGS before configured settings", () => {
    NodeAssert.equal(
      resolveCodexLaunchArgs(" --strict-config ", { T3CODE_CODEX_LAUNCH_ARGS: "--enable foo" }),
      "--enable foo",
    );
  });

  it("uses configured settings when T3CODE_CODEX_LAUNCH_ARGS is empty", () => {
    NodeAssert.equal(
      resolveCodexLaunchArgs(" --strict-config ", { T3CODE_CODEX_LAUNCH_ARGS: "   " }),
      "--strict-config",
    );
  });

  it("ignores whitespace-only environment values", () => {
    NodeAssert.equal(resolveCodexLaunchArgs("", { T3CODE_CODEX_LAUNCH_ARGS: "   " }), "");
  });
});

describe("codexAppServerArgs", () => {
  it("returns the app-server command for empty launch args", () => {
    NodeAssert.deepStrictEqual(codexAppServerArgs(""), ["app-server"]);
  });

  it("appends parsed launch args after app-server", () => {
    NodeAssert.deepStrictEqual(codexAppServerArgs("--strict-config --enable foo"), [
      "app-server",
      "--strict-config",
      "--enable",
      "foo",
    ]);
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
