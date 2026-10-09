import { afterEach, beforeEach, describe, expect, it, vi } from "@effect/vitest";
import type { HermesAgentStatus } from "@t3tools/contracts";

import { AgentDiscovery } from "./AgentDiscovery.ts";

const hermes: HermesAgentStatus = {
  available: true,
  endpoint: "http://127.0.0.1:8642",
  model: "test-model",
  version: "1",
};
const unavailable = async (): Promise<never> => {
  throw new Error("unavailable secret-token");
};

describe("AgentDiscovery", () => {
  beforeEach(() => vi.stubEnv("OPENCLAW_GATEWAY_PORT", undefined));
  afterEach(() => vi.unstubAllEnvs());
  it("discovers OpenClaw independently of Hermes using the configured local port", async () => {
    const command = vi.fn(async (args: readonly string[]) =>
      args[0] === "config"
        ? "19001\n"
        : JSON.stringify({
            ok: true,
            agents: [{ agentId: "main", name: "Assistant" }, { agentId: "research" }],
            channels: { token: "private-value" },
          }),
    );
    const fetch = vi.fn(unavailable);
    const result = await new AgentDiscovery({
      hermesStatus: unavailable,
      command,
      fetch,
    }).discover();
    expect(result.runtimes[0]?.state).toBe("unavailable");
    expect(result.runtimes[1]).toEqual({
      kind: "openclaw",
      state: "running",
      endpoint: "http://127.0.0.1:19001",
      agents: [
        { id: "main", name: "Assistant" },
        { id: "research", name: "research" },
      ],
    });
    expect(command).toHaveBeenLastCalledWith([
      "gateway",
      "health",
      "--port",
      "19001",
      "--json",
      "--timeout",
      "3000",
    ]);
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(JSON.stringify(result)).not.toContain("private-value");
  });

  it("keeps Hermes visible when OpenClaw is unavailable", async () => {
    const result = await new AgentDiscovery({
      hermesStatus: async () => hermes,
      command: unavailable,
      fetch: unavailable,
    }).discover();
    expect(result.runtimes[0]).toMatchObject({
      kind: "hermes",
      state: "running",
      model: "test-model",
      version: "1",
    });
    expect(result.runtimes[1]).toMatchObject({ kind: "openclaw", state: "unavailable" });
  });

  it("falls back to the gateway liveness endpoint when the CLI is missing", async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true, status: "live" }));
    const result = await new AgentDiscovery({
      hermesStatus: async () => hermes,
      command: unavailable,
      fetch,
      openClawPort: "18790",
    }).discover();
    expect(result.runtimes[1]).toMatchObject({ state: "running", agents: [] });
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:18790/healthz",
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it.each([
    ["<html>Control UI</html>", 200],
    ['{"ok":true}', 200],
    ['{"ok":true,"status":"live"}', 503],
  ])(
    "does not mistake an unrelated or failed HTTP response for a running gateway (%s)",
    async (body, status) => {
      const result = await new AgentDiscovery({
        hermesStatus: async () => hermes,
        command: unavailable,
        fetch: async () => new Response(body, { status }),
      }).discover();
      expect(result.runtimes[1]?.state).toBe("unavailable");
    },
  );

  it("reports a starting gateway without claiming it is ready", async () => {
    const result = await new AgentDiscovery({
      hermesStatus: async () => ({ ...hermes, available: false }),
      openClawPort: "18789",
      command: async () => JSON.stringify({ status: "starting" }),
      fetch: unavailable,
    }).discover();
    expect(result.runtimes.map((runtime) => runtime.state)).toEqual(["unavailable", "starting"]);
  });

  it("isolates invalid gateway configuration without making a request", async () => {
    const fetch = vi.fn(unavailable);
    const command = vi.fn(unavailable);
    const result = await new AgentDiscovery({
      hermesStatus: async () => hermes,
      command,
      fetch,
      openClawPort: "99999",
    }).discover();
    expect(result.runtimes.map((runtime) => runtime.state)).toEqual(["running", "unavailable"]);
    expect(command).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
