// @effect-diagnostics nodeBuiltinImport:off -- Mock the native geometry subprocess at its Node boundary.
import * as NodeChildProcess from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { readMacScreenNotches } from "./MacScreenNotch.ts";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

const notch = { displayId: 1, x: 656, width: 200, height: 38 };
const reply = (stdout: string, error: Error | null = null) => {
  const callback = vi.mocked(NodeChildProcess.execFile).mock.calls.at(-1)?.[3];
  if (typeof callback !== "function") throw new Error("Missing native geometry callback");
  callback(error, stdout, "");
};

beforeEach(() => vi.clearAllMocks());

describe("macOS screen notch geometry", () => {
  it("reads native display IDs and cutout dimensions in points", async () => {
    const result = readMacScreenNotches();
    reply(JSON.stringify([notch]));
    await expect(result).resolves.toEqual([notch]);
    expect(NodeChildProcess.execFile).toHaveBeenCalledWith(
      "/usr/bin/osascript",
      ["-l", "JavaScript", "-e", expect.any(String)],
      { timeout: 5_000, maxBuffer: 16_384 },
      expect.any(Function),
    );
  });

  it("supports screens without a camera cutout and unavailable native queries", async () => {
    const external = readMacScreenNotches();
    reply("[]");
    await expect(external).resolves.toEqual([]);
    const unavailable = readMacScreenNotches();
    reply("", new Error("AppKit query failed"));
    await expect(unavailable).resolves.toEqual([]);
  });

  it.each([
    "not JSON",
    JSON.stringify([{ ...notch, width: 0 }]),
    JSON.stringify([{ ...notch, height: -1 }]),
  ])("discards invalid geometry: %s", async (stdout) => {
    const result = readMacScreenNotches();
    reply(stdout);
    await expect(result).resolves.toEqual([]);
  });
});
