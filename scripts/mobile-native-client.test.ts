import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { expect } from "vite-plus/test";

import { NativeClientError, prebuildAndroid, installedBinary } from "./mobile-native-client.ts";

const caches = [".gradle/history", "app/.cxx/object"];

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const mobile = yield* fs.makeTempDirectoryScoped({ prefix: "mobile-native-client-" });
  const android = path.join(mobile, "android");
  for (const cache of caches) {
    yield* fs.makeDirectory(path.dirname(path.join(android, cache)), { recursive: true });
    yield* fs.writeFileString(path.join(android, cache), cache);
  }
  const cleanPrebuild = Effect.gen(function* () {
    yield* fs.remove(android, { recursive: true });
    yield* fs.makeDirectory(path.join(android, "app"), { recursive: true });
    yield* fs.writeFileString(path.join(android, "app/build.gradle"), "regenerated");
  });
  const assertCachesRestored = Effect.gen(function* () {
    for (const cache of caches) {
      assert.strictEqual(yield* fs.readFileString(path.join(android, cache)), cache);
    }
    assert.deepStrictEqual(yield* fs.readDirectory(mobile), ["android"]);
  });
  return { fs, path, mobile, android, cleanPrebuild, assertCachesRestored };
});

it.layer(NodeServices.layer)("prebuildAndroid", (it) => {
  it.effect("keeps Gradle and native caches through a clean prebuild", () =>
    Effect.gen(function* () {
      const { fs, path, mobile, android, cleanPrebuild, assertCachesRestored } = yield* fixture;

      yield* prebuildAndroid(mobile, cleanPrebuild);

      assert.strictEqual(
        yield* fs.readFileString(path.join(android, "app/build.gradle")),
        "regenerated",
      );
      yield* assertCachesRestored;
    }),
  );

  it.effect("restores the caches and returns the error when prebuild fails", () =>
    Effect.gen(function* () {
      const { mobile, cleanPrebuild, assertCachesRestored } = yield* fixture;
      const failure = new NativeClientError({ message: "prebuild failed" });

      const error = yield* prebuildAndroid(
        mobile,
        cleanPrebuild.pipe(Effect.andThen(Effect.fail(failure))),
      ).pipe(Effect.flip);

      assert.strictEqual(error, failure);
      yield* assertCachesRestored;
    }),
  );
});

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
