import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  HostProcessArguments,
  HostProcessExecutablePath,
  HostProcessPlatform,
} from "@t3tools/shared/hostProcess";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import { reconcileService } from "../cli/service.ts";
import * as ProcessRunner from "../processRunner.ts";
import * as BootService from "./bootService.ts";
import { pinnedRuntimePaths } from "./pinnedRuntime.ts";
import {
  parseServiceState,
  SERVICE_LAUNCHER_PROTOCOL,
  serviceStateHasPendingUpdate,
} from "./serviceProtocol.ts";

it("keeps systemd pinned to the stable launcher rather than a versioned server", () => {
  const unit = BootService.renderBootServiceUnit({
    nodePath: "/usr/bin/node",
    launcherPath: "/home/theo/.t3/runtime/service-launcher.mjs",
    baseDir: "/home/theo/.t3",
    logPath: "/home/theo/.t3/userdata/logs/boot-service.log",
    unitPath: "/home/theo/.config/systemd/user/t3code.service",
  });

  assert.equal(
    unit,
    [
      "[Unit]",
      "Description=T3 Code server",
      "StartLimitIntervalSec=300",
      "StartLimitBurst=5",
      "",
      "[Service]",
      "Type=simple",
      "WorkingDirectory=%h",
      "Environment=T3CODE_HOME=/home/theo/.t3",
      "Environment=T3_BOOT_SERVICE_UNIT=t3code.service",
      "ExecStart=/usr/local/bin/node /home/theo/.t3/runtime/versions/0.0.27/node_modules/t3/dist/bin.mjs serve",
      "Restart=always",
      "RestartSec=5",
      "StandardOutput=append:/home/theo/.t3/userdata/logs/boot-service.log",
      "StandardError=append:/home/theo/.t3/userdata/logs/boot-service.log",
      "",
      "[Install]",
      "WantedBy=default.target",
      "",
    ].join("\n"),
  );
});

const makeHarness = Effect.fn("test.make_boot_service_harness")(function* (
  platform: NodeJS.Platform = "linux",
  usePinnedLauncher = false,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* fs.makeTempDirectoryScoped({ prefix: "t3-boot-service-test-" });
  const baseDir = path.join(home, ".t3");
  const sourceLauncher = path.join(home, "service-launcher.mjs");
  const statePath = path.join(baseDir, "runtime", "service-state.json");
  yield* fs.writeFileString(sourceLauncher, "export {};\n");
  const runtime = pinnedRuntimePaths(path, baseDir, "1.2.3");
  yield* fs.makeDirectory(path.dirname(runtime.entryPath), { recursive: true });
  yield* fs.writeFileString(runtime.entryPath, "export {};\n");
  yield* fs.writeFileString(
    path.join(path.dirname(runtime.entryPath), "service-launcher.mjs"),
    "export const source = 'pinned runtime';\n",
  );
  yield* fs.writeFileString(runtime.sentinelPath, "1.2.3\n");

  const commands: string[] = [];
  const control: { failCommand: string | undefined } = { failCommand: undefined };
  const runner = ProcessRunner.ProcessRunner.of({
    run: (input) =>
      Effect.sync(() => {
        const command = `${input.command} ${input.args.join(" ")}`;
        commands.push(command);
        return {
          stdout: input.args[1] === "--version" ? "t3 v1.2.3\n" : "",
          stderr: "",
          code: ChildProcessSpawner.ExitCode(command === control.failCommand ? 1 : 0),
          timedOut: false,
          stdoutTruncated: false,
          stderrTruncated: false,
        };
      }),
  });
  const service = yield* BootService.make({
    baseDir,
    logsDir: path.join(baseDir, "userdata", "logs"),
    cliVersion: "1.2.3",
    host: {
      execPath: "/usr/bin/node",
      ...(usePinnedLauncher ? {} : { launcherSourcePath: sourceLauncher }),
    },
  }).pipe(
    Effect.provideService(ProcessRunner.ProcessRunner, runner),
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(HostProcessPlatform, platform),
        Layer.succeed(HostProcessExecutablePath, "/usr/bin/node"),
        Layer.succeed(HostProcessArguments, ["/usr/bin/node", path.join(home, "bin.mjs")]),
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { HOME: home } })),
      ),
    ),
  );
  return { service, fs, statePath, commands, control };
});

it("flags package-manager cache entry points as ephemeral", () => {
  assert.isTrue(
    BootService.isEphemeralCacheEntry("/home/theo/.npm/_npx/abc123/node_modules/t3/dist/bin.mjs"),
  );
  assert.isTrue(
    BootService.isEphemeralCacheEntry("C:\\Users\\theo\\AppData\\npm-cache\\_npx\\abc\\bin.mjs"),
  );
  assert.isTrue(
    BootService.isEphemeralCacheEntry(
      "/home/theo/.cache/pnpm/dlx/abc/node_modules/t3/dist/bin.mjs",
    ),
  );
  assert.isTrue(
    BootService.isEphemeralCacheEntry("/home/theo/.bun/install/cache/t3@0.0.27/dist/bin.mjs"),
  );
  assert.isFalse(BootService.isEphemeralCacheEntry("/usr/local/lib/node_modules/t3/dist/bin.mjs"));
  assert.isFalse(
    BootService.isEphemeralCacheEntry(
      "/home/theo/dev/pnpm/dlx-tools/t3/node_modules/t3/dist/bin.mjs",
    ),
  );
  assert.isFalse(
    BootService.isEphemeralCacheEntry(
      "/home/theo/.t3/runtime/versions/0.0.27/node_modules/t3/dist/bin.mjs",
    ),
  );
});

it.layer(NodeServices.layer)("BootService", (it) => {
  it.effect("reconciles the standalone service once and is then idempotent", () =>
    Effect.gen(function* () {
      const { dirs } = yield* makeTestContext();
      const commands: Array<RecordedCommand> = [];
      const service = yield* BootService.make({
        baseDir: dirs.baseDir,
        logsDir: dirs.logsDir,
        cliVersion: "0.0.27",
        host: makeHost(dirs.stableEntry),
      }).pipe(Effect.provide(makeRecordingRunnerLayer(commands)), provideHostRefs(dirs.home));

      const first = yield* reconcileService().pipe(
        Effect.provideService(BootService.BootService, service),
      );
      assert.isTrue(first.changed);
      if (!first.changed) return;
      assert.isFalse(first.previouslyInstalled);

      const commandCount = commands.length;
      const second = yield* reconcileService().pipe(
        Effect.provideService(BootService.BootService, service),
      );
      assert.isFalse(second.changed);
      assert.lengthOf(commands, commandCount);
    }),
  );

  it.effect("installs the unit, enables the service, and enables linger", () =>
    Effect.gen(function* () {
      const { service, fs, statePath, commands } = yield* makeHarness();
      const plan = yield* service.install;

      expect(parseServiceState(yield* fs.readFileString(statePath))).toEqual({
        protocol: SERVICE_LAUNCHER_PROTOCOL,
        activeVersion: "1.2.3",
      });
      expect(yield* fs.readFileString(plan.launcherPath)).toBe("export {};\n");
      expect((yield* service.status).current).toBe(true);
      // @effect-diagnostics-next-line preferSchemaOverJson:off - fixed launcher-owned test document.
      const pendingState = JSON.stringify({
        protocol: SERVICE_LAUNCHER_PROTOCOL,
        activeVersion: "1.2.3",
        update: {
          id: "u",
          fromVersion: "1.2.3",
          targetVersion: "1.2.4",
          dbPath: "/tmp/state.sqlite",
          status: "pending",
        },
      });
      yield* fs.writeFileString(statePath, pendingState);
      expect((yield* service.status).current).toBe(false);
      expect(yield* service.uninstall).toBe(true);
      expect((yield* service.status).installed).toBe(false);
      expect(commands.some((command) => command.startsWith("npm "))).toBe(false);
    }),
  );

  it.effect("copies the launcher from the prepared pinned runtime", () =>
    Effect.gen(function* () {
      const { service, fs } = yield* makeHarness("linux", true);
      const plan = yield* service.install;

      expect(yield* fs.readFileString(plan.launcherPath)).toBe(
        "export const source = 'pinned runtime';\n",
      );
    }),
  );

  it.effect("restarts an installed service when repair fails", () =>
    Effect.gen(function* () {
      const { service, commands, control } = yield* makeHarness();
      yield* service.install;
      commands.length = 0;
      control.failCommand = "systemctl --user daemon-reload";

      const error = yield* service.install.pipe(Effect.flip);
      expect(error._tag).toBe("BootServiceCommandError");
      expect(commands.filter((command) => command.startsWith("systemctl "))).toEqual([
        "systemctl --user stop t3code.service",
        "systemctl --user daemon-reload",
        "systemctl --user restart t3code.service",
      ]);
    }),
  );

  it.effect("restarts without overwriting a pending remote update", () =>
    Effect.gen(function* () {
      const { service, fs, statePath, commands } = yield* makeHarness();
      yield* service.install;
      // @effect-diagnostics-next-line preferSchemaOverJson:off - fixed launcher-owned test document.
      const pendingState = JSON.stringify({
        protocol: SERVICE_LAUNCHER_PROTOCOL - 1,
        activeVersion: "1.2.3",
        update: {
          id: "remote-update",
          fromVersion: "1.2.3",
          targetVersion: "1.2.4",
          status: "pending",
        },
      });
      yield* fs.writeFileString(statePath, pendingState);
      commands.length = 0;

      expect((yield* service.install.pipe(Effect.flip))._tag).toBe("BootServiceUpdatePendingError");
      expect(serviceStateHasPendingUpdate(yield* fs.readFileString(statePath))).toBe(true);
      expect(commands.filter((command) => command.startsWith("systemctl "))).toEqual([
        "systemctl --user stop t3code.service",
        "systemctl --user restart t3code.service",
      ]);
    }),
  );

  it.effect("fails closed off Linux", () =>
    Effect.gen(function* () {
      const { dirs } = yield* makeTestContext();
      const commands: Array<RecordedCommand> = [];
      const service = yield* BootService.make({
        baseDir: dirs.baseDir,
        logsDir: dirs.logsDir,
        cliVersion: "0.0.27",
      }).pipe(
        Effect.provide(makeRecordingRunnerLayer(commands)),
        provideHostRefs(dirs.home),
        Effect.provideService(HostProcessExecutablePath, "/opt/node/bin/node"),
        Effect.provideService(HostProcessArguments, ["/opt/node/bin/node", dirs.stableEntry]),
      );

      const plan = yield* service.install;
      assert.equal(plan.nodePath, "/opt/node/bin/node");
      assert.equal(plan.t3EntryPath, dirs.stableEntry);
    }),
  );

  it.effect("cleans up and fails when the pinned runtime install fails", () =>
    Effect.gen(function* () {
      const { dirs, fs, path } = yield* makeTestContext();
      const commands: Array<RecordedCommand> = [];
      const service = yield* BootService.make({
        baseDir: dirs.baseDir,
        logsDir: dirs.logsDir,
        cliVersion: "0.0.27",
        host: makeHost("/home/theo/.npm/_npx/abc/node_modules/t3/dist/bin.mjs"),
      }).pipe(
        Effect.provide(makeRecordingRunnerLayer(commands, { failCommand: "npm" })),
        provideHostRefs(dirs.home),
      );

      const error = yield* service.install.pipe(Effect.flip);
      assert.isTrue(isCommandError(error));
      const runtimeDir = path.join(dirs.baseDir, "runtime", "versions", "0.0.27");
      // The half-installed tree must not be reused by the next attempt.
      assert.isFalse(yield* fs.exists(runtimeDir));
      assert.isFalse(yield* fs.exists(path.join(runtimeDir, ".install-complete")));
    }),
  );

  it.effect("reports an installed-but-stale unit so the lifecycle can offer a repair", () =>
    Effect.gen(function* () {
      const { dirs, fs, path } = yield* makeTestContext();
      const commands: Array<RecordedCommand> = [];
      const service = yield* BootService.make({
        baseDir: dirs.baseDir,
        logsDir: dirs.logsDir,
        cliVersion: "0.0.27",
        host: makeHost(dirs.stableEntry),
      }).pipe(Effect.provide(makeRecordingRunnerLayer(commands)), provideHostRefs(dirs.home));

      const unitDir = path.join(dirs.home, ".config", "systemd", "user");
      yield* fs.makeDirectory(unitDir, { recursive: true });
      yield* fs.writeFileString(
        path.join(unitDir, "t3code.service"),
        "[Service]\nExecStart=/old/node /old/t3 serve\n",
      );

      const status = yield* service.status;
      assert.isTrue(status.supported);
      assert.isTrue(status.installed);
      assert.isFalse(status.current);
    }),
  );

  it.effect("reports a current unit as stale when its entry point is gone", () =>
    Effect.gen(function* () {
      const { dirs, fs } = yield* makeTestContext();
      const commands: Array<RecordedCommand> = [];
      const service = yield* BootService.make({
        baseDir: dirs.baseDir,
        logsDir: dirs.logsDir,
        cliVersion: "0.0.27",
        host: makeHost(dirs.stableEntry),
      }).pipe(Effect.provide(makeRecordingRunnerLayer(commands)), provideHostRefs(dirs.home));

      yield* service.install;
      assert.isTrue((yield* service.status).current);

      // The pinned runtime (or global bin) was deleted to reclaim space; the
      // unit still matches byte-for-byte but would crashloop at boot.
      yield* fs.remove(dirs.stableEntry);
      const status = yield* service.status;
      assert.isTrue(status.installed);
      assert.isFalse(status.current);
    }),
  );

  it.effect("fails on non-Linux platforms without touching the filesystem", () =>
    Effect.gen(function* () {
      const { dirs, fs, path } = yield* makeTestContext();
      const commands: Array<RecordedCommand> = [];
      const service = yield* BootService.make({
        baseDir: dirs.baseDir,
        logsDir: dirs.logsDir,
        cliVersion: "0.0.27",
        host: makeHost("/usr/local/lib/node_modules/t3/dist/bin.mjs"),
      }).pipe(
        Effect.provide(makeRecordingRunnerLayer(commands)),
        provideHostRefs(dirs.home, "darwin"),
      );

      const error = yield* service.install.pipe(Effect.flip);
      assert.isTrue(isUnsupportedError(error));
      assert.lengthOf(commands, 0);
      assert.isFalse(
        yield* fs.exists(path.join(dirs.home, ".config", "systemd", "user", "t3code.service")),
      );

      const status = yield* service.status;
      assert.isFalse(status.supported);
      assert.isFalse(status.installed);
    }),
  );

  it.effect("removes the unit file when an activation step fails", () =>
    Effect.gen(function* () {
      const { dirs, fs, path } = yield* makeTestContext();
      const commands: Array<RecordedCommand> = [];
      const service = yield* BootService.make({
        baseDir: dirs.baseDir,
        logsDir: dirs.logsDir,
        cliVersion: "0.0.27",
        host: makeHost("/usr/local/lib/node_modules/t3/dist/bin.mjs"),
      }).pipe(
        Effect.provide(makeRecordingRunnerLayer(commands, { failCommand: "loginctl" })),
        provideHostRefs(dirs.home),
      );

      const error = yield* service.install.pipe(Effect.flip);
      assert.isTrue(isCommandError(error));
      // A leftover unit would make status report "installed" even though
      // linger never happened.
      assert.isFalse(
        yield* fs.exists(path.join(dirs.home, ".config", "systemd", "user", "t3code.service")),
      );
      const status = yield* service.status;
      assert.isFalse(status.installed);
      assert.isTrue(
        commands.some(
          ({ command, args }) =>
            command === "systemctl" && args.join(" ") === "--user disable --now t3code.service",
        ),
      );
    }),
  );

  it.effect("restores the previous unit when a repair cannot activate", () =>
    Effect.gen(function* () {
      const { dirs, fs, path } = yield* makeTestContext();
      const initialCommands: Array<RecordedCommand> = [];
      const initialService = yield* BootService.make({
        baseDir: dirs.baseDir,
        logsDir: dirs.logsDir,
        cliVersion: "0.0.27",
        host: makeHost(dirs.stableEntry),
      }).pipe(
        Effect.provide(makeRecordingRunnerLayer(initialCommands)),
        provideHostRefs(dirs.home),
      );
      yield* initialService.install;

      const unitPath = path.join(dirs.home, ".config", "systemd", "user", "t3code.service");
      const previousUnit = yield* fs.readFileString(unitPath);
      const replacementEntry = path.join(dirs.home, "replacement-bin.mjs");
      yield* fs.writeFileString(replacementEntry, "#!/usr/bin/env node\n");
      const repairCommands: Array<RecordedCommand> = [];
      const repairService = yield* BootService.make({
        baseDir: dirs.baseDir,
        logsDir: dirs.logsDir,
        cliVersion: "0.0.28",
        host: makeHost(replacementEntry),
      }).pipe(
        Effect.provide(makeRecordingRunnerLayer(repairCommands, { failCommand: "loginctl" })),
        provideHostRefs(dirs.home),
      );

      const error = yield* repairService.install.pipe(Effect.flip);

      assert.isTrue(isCommandError(error));
      assert.equal(yield* fs.readFileString(unitPath), previousUnit);
      assert.isTrue(
        repairCommands.some(
          ({ command, args }) =>
            command === "systemctl" && args.join(" ") === "--user restart t3code.service",
        ),
      );
    }),
  );

  it.effect("keeps the unit when stopping it during uninstall fails", () =>
    Effect.gen(function* () {
      const { dirs, fs, path } = yield* makeTestContext();
      const installCommands: Array<RecordedCommand> = [];
      const installedService = yield* BootService.make({
        baseDir: dirs.baseDir,
        logsDir: dirs.logsDir,
        cliVersion: "0.0.27",
        host: makeHost(dirs.stableEntry),
      }).pipe(
        Effect.provide(makeRecordingRunnerLayer(installCommands)),
        provideHostRefs(dirs.home),
      );
      yield* installedService.install;

      const uninstallCommands: Array<RecordedCommand> = [];
      const failingService = yield* BootService.make({
        baseDir: dirs.baseDir,
        logsDir: dirs.logsDir,
        cliVersion: "0.0.27",
        host: makeHost(dirs.stableEntry),
      }).pipe(
        Effect.provide(
          makeRecordingRunnerLayer(uninstallCommands, {
            failWhen: (command, args) =>
              command === "systemctl" && args.includes("disable") && args.includes("--now"),
          }),
        ),
        provideHostRefs(dirs.home),
      );

      const error = yield* failingService.uninstall.pipe(Effect.flip);

      assert.isTrue(isCommandError(error));
      assert.isTrue(
        yield* fs.exists(path.join(dirs.home, ".config", "systemd", "user", "t3code.service")),
      );
    }),
  );

  it.effect("appends failed steps to the boot-service log", () =>
    Effect.gen(function* () {
      const { dirs, fs, path } = yield* makeTestContext();
      const commands: Array<RecordedCommand> = [];
      const service = yield* BootService.make({
        baseDir: dirs.baseDir,
        logsDir: dirs.logsDir,
        cliVersion: "0.0.27",
        host: makeHost("/usr/local/lib/node_modules/t3/dist/bin.mjs"),
      }).pipe(
        Effect.provide(makeRecordingRunnerLayer(commands, { failCommand: "systemctl" })),
        provideHostRefs(dirs.home),
      );

      const error = yield* service.install.pipe(Effect.flip);
      assert.isTrue(isCommandError(error));
      if (!isCommandError(error)) return;
      assert.equal(error.exitCode, 1);
      assert.equal(error.stderrLength, "systemctl exploded".length);

      const logPath = path.join(dirs.logsDir, "boot-service.log");
      assert.isTrue(yield* fs.exists(logPath));
      assert.include(yield* fs.readFileString(logPath), "exit code 1");
    }),
  );
});
