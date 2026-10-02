// @effect-diagnostics nodeBuiltinImport:off globalTimers:off preferSchemaOverJson:off - External CLI and HTTP discovery boundary.
import * as NodeChildProcess from "node:child_process";
import * as NodeOS from "node:os";
import type {
  AgentDiscoveryResult,
  DiscoveredAgentRuntime,
  HermesAgentStatus,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { hermesClient } from "./HermesClient.ts";

const OpenClawHealth = Schema.Struct({
  ok: Schema.optional(Schema.Boolean),
  status: Schema.optional(Schema.String),
  agents: Schema.optional(
    Schema.Array(
      Schema.Struct({
        agentId: Schema.String,
        name: Schema.optional(Schema.String),
      }),
    ),
  ),
});
const decodeHealth = Schema.decodeUnknownSync(OpenClawHealth);
const decodePort = Schema.decodeUnknownSync(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
);

type Command = (args: readonly string[]) => Promise<string>;
const openClawCommand: Command = (args) =>
  new Promise((resolve, reject) => {
    NodeChildProcess.execFile(
      process.env.OPENCLAW_CLI_PATH ?? "openclaw",
      [...args],
      {
        timeout: 8_000,
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
        windowsHide: true,
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });

interface DiscoveryOptions {
  readonly hermesStatus?: () => Promise<HermesAgentStatus>;
  readonly command?: Command;
  readonly fetch?: typeof globalThis.fetch;
  readonly openClawPort?: string;
}

/** Each environment probes its own runners; clients aggregate results over existing T3 connections. */
export class AgentDiscovery {
  readonly #hermesStatus: () => Promise<HermesAgentStatus>;
  readonly #command: Command;
  readonly #fetch: typeof globalThis.fetch;
  readonly #openClawPort: string | undefined;

  constructor(options: DiscoveryOptions = {}) {
    this.#hermesStatus = options.hermesStatus ?? (() => hermesClient.status());
    this.#command = options.command ?? openClawCommand;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#openClawPort = options.openClawPort ?? process.env.OPENCLAW_GATEWAY_PORT;
  }

  async #hermes(): Promise<DiscoveredAgentRuntime> {
    const status = await this.#hermesStatus();
    return {
      kind: "hermes",
      state: status.available ? "running" : "unavailable",
      endpoint: status.endpoint,
      agents: [],
      ...(status.model ? { model: status.model } : {}),
      ...(status.version ? { version: status.version } : {}),
      ...(status.message ? { message: status.message } : {}),
    };
  }

  async #openClaw(): Promise<DiscoveredAgentRuntime> {
    // An explicit port keeps a CLI configured for a remote gateway from being
    // misreported as an agent running on this computer.
    const configuredPort =
      this.#openClawPort ??
      (await this.#command(["config", "get", "gateway.port", "--json"]).catch(() => "18789"));
    const port = decodePort(Number(configuredPort.trim()));
    const endpoint = `http://127.0.0.1:${port}`;
    const base = { kind: "openclaw" as const, endpoint, agents: [] };
    try {
      const health = decodeHealth(
        JSON.parse(
          await this.#command([
            "gateway",
            "health",
            "--port",
            String(port),
            "--json",
            "--timeout",
            "3000",
          ]),
        ),
      );
      if (health.ok === true) {
        return {
          ...base,
          state: "running",
          agents: (health.agents ?? []).map((agent) => ({
            id: agent.agentId,
            name: agent.name?.trim() || agent.agentId,
          })),
        };
      }
      if (health.status === "starting")
        return { ...base, state: "starting", message: "OpenClaw is starting." };
    } catch {
      // A running gateway may be available even when its CLI is absent from T3's PATH.
    }
    try {
      const response = await this.#fetch(`${endpoint}/healthz`, {
        signal: AbortSignal.timeout(3_000),
        redirect: "error",
      });
      const health = decodeHealth(await response.json());
      if (response.ok && health.ok === true && health.status === "live") {
        return {
          ...base,
          state: "running",
          message: "Gateway detected. Use OpenClaw’s CLI on this computer to manage its agents.",
        };
      }
    } catch {
      // An unavailable runner is one discovery result, not a failure of the other probes.
    }
    return {
      ...base,
      state: "unavailable",
      message: "No reachable OpenClaw gateway. Start OpenClaw on this computer, then refresh.",
    };
  }

  async discover(): Promise<AgentDiscoveryResult> {
    const probes = [
      { kind: "hermes" as const, run: () => this.#hermes() },
      { kind: "openclaw" as const, run: () => this.#openClaw() },
    ];
    const runtimes = await Promise.all(
      probes.map(async ({ kind, run }): Promise<DiscoveredAgentRuntime> => {
        try {
          return await run();
        } catch {
          return {
            kind,
            state: "unavailable",
            endpoint: null,
            agents: [],
            message: `Could not discover ${kind === "hermes" ? "Hermes" : "OpenClaw"}. Check its configuration on this computer.`,
          };
        }
      }),
    );
    return { hostname: NodeOS.hostname(), runtimes };
  }
}

export const agentDiscovery = new AgentDiscovery();
