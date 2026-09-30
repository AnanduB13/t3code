import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { expect } from "vite-plus/test";

import { installedBinary } from "./mobile-native-client.ts";

it.layer(NodeServices.layer)("native client identity", (it) => {
  it.effect.each(["com.anandub13.t3code.afterdark.dev", "com.example.custom.dev"])(
    "finds and fingerprints the configured Android app %s",
    (androidPackage) =>
      Effect.gen(function* () {
        const calls: ReadonlyArray<string>[] = [];
        const result = yield* installedBinary("android", "emulator-5554", (_program, args) => {
          calls.push(args);
          if (args[0] === "--eval")
            return Effect.succeed(
              `config notice\nT3_NATIVE_APP_IDENTITY=${JSON.stringify({
                iosBundleIdentifier: "com.t3tools.t3code.dev",
                androidPackage,
                xcodeProjectName: "AfterDarkDev",
              })}`,
            );
          if (args.includes("list")) return Effect.succeed(`package:${androidPackage}\n`);
          if (args.includes("path"))
            return Effect.succeed("package:/data/app/after-dark/base.apk\n");
          return Effect.succeed(`${"a".repeat(64)}  /data/app/after-dark/base.apk`);
        });
        expect(result).toMatch(/^[a-f0-9]{64}$/);
        expect(calls).toContainEqual([
          "-s",
          "emulator-5554",
          "shell",
          "pm",
          "list",
          "packages",
          androidPackage,
        ]);
        expect(calls).toContainEqual([
          "-s",
          "emulator-5554",
          "shell",
          "pm",
          "path",
          androidPackage,
        ]);
      }),
  );

  it.effect("keeps the configured iOS bundle identity separate from Android", () =>
    Effect.gen(function* () {
      const calls: ReadonlyArray<string>[] = [];
      const result = yield* installedBinary("ios", "simulator-id", (_program, args) => {
        calls.push(args);
        if (args[0] === "--eval")
          return Effect.succeed(
            `T3_NATIVE_APP_IDENTITY=${JSON.stringify({
              iosBundleIdentifier: "com.t3tools.t3code.dev",
              androidPackage: "com.anandub13.t3code.afterdark.dev",
              xcodeProjectName: "AfterDarkDev",
            })}`,
          );
        return Effect.succeed('"com.anandub13.t3code.afterdark.dev"');
      });
      expect(result).toBeNull();
      expect(calls.at(-1)).toEqual(["simctl", "listapps", "simulator-id"]);
    }),
  );
});
