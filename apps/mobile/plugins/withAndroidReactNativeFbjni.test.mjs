import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import { expect, it } from "vitest";
import withAndroidReactNativeFbjni from "./withAndroidReactNativeFbjni.cjs";

async function transform(contents) {
  const config = withAndroidReactNativeFbjni({ name: "Test", slug: "test" });
  const result = await config.mods.android.projectBuildGradle({
    ...config,
    modRequest: { platform: "android", modName: "projectBuildGradle", introspect: false },
    modResults: { language: "groovy", contents },
  });
  return result.modResults.contents;
}

it("keeps fbjni aligned with the installed React Native runtime across prebuilds and upgrades", async () => {
  const require = NodeModule.createRequire(import.meta.url);
  const catalog = NodeFS.readFileSync(
    NodePath.join(
      NodePath.dirname(require.resolve("react-native/package.json")),
      "gradle/libs.versions.toml",
    ),
    "utf8",
  );
  const version = catalog.match(/^fbjni\s*=\s*"([\d.]+)"/m)[1];
  const original = 'apply plugin: "expo-root-project"\n';
  const generated = await transform(original);
  expect(generated).toContain(original);
  expect(generated).toContain(`resolutionStrategy.force 'com.facebook.fbjni:fbjni:${version}'`);
  expect(await transform(generated)).toBe(generated);
  expect(await transform(generated.replace(`fbjni:${version}`, "fbjni:0.0.0"))).toBe(generated);
});
