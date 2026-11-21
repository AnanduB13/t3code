import { tokenizeCliArgs } from "@t3tools/shared/cliArgs";

const T3CODE_CODEX_LAUNCH_ARGS_ENV = "T3CODE_CODEX_LAUNCH_ARGS";
export const CODEX_DEFAULT_AUTO_COMPACT_TOKEN_LIMIT = 180_000;

const CODEX_AUTO_COMPACT_CONFIG_KEY = "model_auto_compact_token_limit";

function hasCodexConfigOverride(args: ReadonlyArray<string>, key: string): boolean {
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === undefined) continue;

    if (argument === "-c" || argument === "--config") {
      if (args[index + 1]?.startsWith(`${key}=`)) return true;
      index++;
      continue;
    }

    if (argument.startsWith(`-c=${key}=`) || argument.startsWith(`--config=${key}=`)) {
      return true;
    }
  }
  return false;
}

export const resolveCodexLaunchArgs = (
  launchArgs?: string,
  environment: NodeJS.ProcessEnv = process.env,
) => {
  const override = environment[T3CODE_CODEX_LAUNCH_ARGS_ENV];
  return override?.trim() ? override : launchArgs?.trim() || "";
};

const codexLaunchArgv = (launchArgs?: string): ReadonlyArray<string> => tokenizeCliArgs(launchArgs);

// T3 unsubscribes only when it unloads a thread; Codex's own unload delay would stack on that.
export const codexAppServerArgs = (launchArgs?: string) => [
  "app-server",
  "-c",
  "thread_unload_delay_secs=0",
  ...codexLaunchArgv(launchArgs),
];

interface LaunchArgFilter {
  readonly switches: ReadonlySet<string>;
  readonly valueFlags: ReadonlySet<string>;
  readonly inlinePrefixes: ReadonlyArray<string>;
}

const SHARED_VALUE_FLAGS = ["--config", "-c", "--enable", "--disable"];
const SHARED_INLINE_PREFIXES = ["--config=", "-c=", "--enable=", "--disable="];

const MCP_LIST_FILTER: LaunchArgFilter = {
  switches: new Set(),
  valueFlags: new Set([...SHARED_VALUE_FLAGS, "--profile", "-p"]),
  inlinePrefixes: [...SHARED_INLINE_PREFIXES, "--profile=", "-p="],
};

const EXEC_FILTER: LaunchArgFilter = {
  switches: new Set(["--strict-config", "--oss"]),
  valueFlags: new Set([...SHARED_VALUE_FLAGS, "--local-provider", "--profile", "-p"]),
  inlinePrefixes: [...SHARED_INLINE_PREFIXES, "--local-provider=", "--profile=", "-p="],
};

const filterLaunchArgs = (launchArgs: string | undefined, allowed: LaunchArgFilter) => {
  const args = codexLaunchArgv(launchArgs);
  const kept: Array<string> = [];

  for (let index = 0; index < args.length; index++) {
    const rawArg = args[index];
    if (rawArg === undefined) continue;
    const arg = rawArg.replace(/^(-[cp])(?=[^=])/u, "$1=");

    if (allowed.switches.has(arg)) {
      kept.push(arg);
    } else if (allowed.valueFlags.has(arg)) {
      const value = args[index + 1];
      if (value !== undefined && !value.startsWith("-")) {
        kept.push(arg, value);
        index++;
      }
    } else if (allowed.inlinePrefixes.some((prefix) => arg.startsWith(prefix))) {
      kept.push(arg);
    }
  }

  return kept;
};

const MCP_LIST_DISABLED_FEATURES = new Set(["apps", "connectors", "plugins"]);
const EXEC_DISABLED_FEATURES = new Set([...MCP_LIST_DISABLED_FEATURES, "hooks", "codex_hooks"]);

// Codex can apply explicit --enable flags after trailing -c overrides.
const omitFeatureEnables = (args: ReadonlyArray<string>, features: ReadonlySet<string>) =>
  args.filter((arg, index) => {
    if (arg.startsWith("--enable=")) return !features.has(arg.slice("--enable=".length));
    if (arg === "--enable") return !features.has(args[index + 1] ?? "");
    return !(args[index - 1] === "--enable" && features.has(arg));
  });

export const codexExecLaunchArgs = (launchArgs?: string) =>
  omitFeatureEnables(filterLaunchArgs(launchArgs, EXEC_FILTER), EXEC_DISABLED_FEATURES);

export const codexMcpListLaunchArgs = (launchArgs?: string) =>
  omitFeatureEnables(filterLaunchArgs(launchArgs, MCP_LIST_FILTER), MCP_LIST_DISABLED_FEATURES);
export const codexSessionAppServerArgs = (
  appServerArgs: ReadonlyArray<string> | undefined,
  launchArgs: string | undefined,
) => {
  const launchAppServerArgs = codexAppServerArgs(launchArgs);
  const combinedArgs = appServerArgs
    ? [...launchAppServerArgs, ...appServerArgs]
    : [...launchAppServerArgs];
  if (hasCodexConfigOverride(combinedArgs, CODEX_AUTO_COMPACT_CONFIG_KEY)) {
    return combinedArgs;
  }
  return [
    ...combinedArgs,
    "-c",
    `${CODEX_AUTO_COMPACT_CONFIG_KEY}=${CODEX_DEFAULT_AUTO_COMPACT_TOKEN_LIMIT}`,
  ];
};
