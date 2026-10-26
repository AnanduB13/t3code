const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { withProjectBuildGradle } = require("expo/config-plugins");

module.exports = function withAndroidReactNativeFbjni(config) {
  return withProjectBuildGradle(config, (nextConfig) => {
    const catalog = readFileSync(
      join(dirname(require.resolve("react-native/package.json")), "gradle/libs.versions.toml"),
      "utf8",
    );
    const version = catalog.match(/^fbjni\s*=\s*"([\d.]+)"/m)?.[1];
    if (!version) throw new Error("Could not resolve React Native's compatible fbjni version.");
    // Shiki requests fbjni:+. Newer releases require a different libc++ than RN
    // packages, crashing at startup before JavaScript can load.
    const block = `// BEGIN T3 React Native fbjni compatibility
allprojects {
  configurations.configureEach {
    resolutionStrategy.force 'com.facebook.fbjni:fbjni:${version}'
  }
}
// END T3 React Native fbjni compatibility`;
    const pattern =
      /\/\/ BEGIN T3 React Native fbjni compatibility[\s\S]*?\/\/ END T3 React Native fbjni compatibility/;
    const contents = nextConfig.modResults.contents;
    nextConfig.modResults.contents = pattern.test(contents)
      ? contents.replace(pattern, block)
      : `${contents}\n${block}\n`;
    return nextConfig;
  });
};
