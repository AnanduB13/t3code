import { tokenizeCliArgs } from "@t3tools/shared/cliArgs";

export const T3CODE_CODEX_LAUNCH_ARGS_ENV = "T3CODE_CODEX_LAUNCH_ARGS";
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
) => environment[T3CODE_CODEX_LAUNCH_ARGS_ENV]?.trim() || launchArgs?.trim() || "";

export const codexLaunchArgv = (launchArgs?: string): ReadonlyArray<string> =>
  tokenizeCliArgs(launchArgs);

export const codexAppServerArgs = (launchArgs?: string) => [
  "app-server",
  ...codexLaunchArgv(launchArgs),
];

export const codexExecLaunchArgs = (launchArgs?: string) => {
  const args = codexLaunchArgv(launchArgs);
  const execArgs: Array<string> = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === undefined) continue;

    if (arg === "--strict-config" || arg.startsWith("--config=") || arg.startsWith("-c=")) {
      execArgs.push(arg);
    } else if (arg === "--config" || arg === "-c" || arg === "--enable" || arg === "--disable") {
      const value = args[index + 1];
      if (value !== undefined && !value.startsWith("-")) {
        execArgs.push(arg, value);
        index++;
      }
    } else if (arg.startsWith("--enable=") || arg.startsWith("--disable=")) {
      execArgs.push(arg);
    }
  }

  return execArgs;
};

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
