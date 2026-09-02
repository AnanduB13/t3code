# T3 Code: After Dark Mobile

> [!WARNING]
> The After Dark Android edition is currently distributed from source. It uses a separate package
> identity so it can be installed alongside the official T3 Code app.

## Quickstart

> [!NOTE]
> Uses native modules so using Expo Go is not supported. You need to use the Expo Dev Client.

This app has three After Dark variants:

- `development`: Expo dev client, installable as `After Dark Dev`
- `preview`: persistent internal preview build, installable as `After Dark Nightly`
- `production`: store/release build as `T3 Code: After Dark`

Android defaults to `com.anandub13.t3code.afterdark`, with `.dev` and `.preview` suffixes for the
other variants. Set `T3CODE_ANDROID_PACKAGE` before publishing if your Play Console uses another
package. OTA updates are deliberately disabled until `T3CODE_MOBILE_EAS_PROJECT_ID` points to an
After Dark-owned Expo project; the fork must never consume the official app's update channel.

## After Dark OTA updates

The production APK checks the `production` EAS Update channel when it launches. It also exposes
**Settings → App → Check for Updates**. Before building the one-time OTA-capable base APK, link an
After Dark-owned Expo project in the repository-root `.env.local`:

```bash
T3CODE_MOBILE_EAS_PROJECT_ID=your-expo-project-uuid
```

After that APK is installed, publish JavaScript, styling, and asset changes without rebuilding it:

```bash
vpx eas-cli@latest update \
  --channel production \
  --environment production \
  --platform android \
  --message "Describe the update"
```

Native dependency, config-plugin, permission, package identity, or native source changes still need
a new APK. The fingerprint runtime policy prevents an incompatible OTA from reaching an old binary.

Run commands from `apps/mobile`.

T3 Connect is optional and disabled in a fresh clone. Public configuration belongs in the
repository-root `.env` or `.env.local`, not an `apps/mobile/.env` file. See
[`../../.env.example`](../../.env.example).

## Development

Build and run the local Android dev client (Android SDK plus an emulator or connected device
required):

```bash
vp run android:dev
```

Build a self-contained production-identity Android app locally:

```bash
vp run android:prod
```

Start Metro for the dev client:

```bash
vp run dev:client
```

Metro keeps its transform cache between ordinary starts. If the cache itself is causing stale or
invalid output, clear it for one development-client start:

```bash
vp run dev:client:reset
```

Run that reset once after installing or changing the Uniwind dependency patch. Cached transforms
can otherwise reference its previous pnpm package path. Ordinary Metro starts still keep the cache.

Component edits use Fast Refresh. Connection-runtime edits replace the active Effect layer through
a stable atom runtime, preserving navigation and existing atom subscribers. Replaced registries
and managed runtimes dispose their resources; the app does not force a JavaScript reload. The Uniwind patch
skips global style invalidation when generated styles and themes are unchanged, while real style
changes still refresh. See [mobile development lifecycle](../../docs/internals/mobile-development.md)
for the lifetime boundaries.

Build and run the local iOS dev client:

```bash
vp run ios:dev
```

If your Xcode account only has a Personal Team, use a bundle identifier you control and opt into the
reduced-capability local build. Personal Team builds omit the widget and share extensions, push
entitlement, and native Sign in with Apple entitlement; builds without this opt-in are unchanged.

```bash
T3CODE_IOS_PERSONAL_TEAM=1 \
T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID=com.example.t3code.dev \
vp run ios:dev
```

Build and install a self-contained Release app that does not need Metro:

```bash
vp run ios:release
```

The Personal Team equivalent also needs a unique bundle identifier:

```bash
T3CODE_IOS_PERSONAL_TEAM=1 \
T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID=com.example.t3code \
vp run ios:release
```

Build and run the local iOS preview app:

```bash
vp run ios:preview
```

Force the review diff highlighter engine:

```bash
EXPO_PUBLIC_REVIEW_HIGHLIGHTER_ENGINE=javascript vp run ios:dev
```

`javascript` is the default and recommended setting for the review diff screen. Set `EXPO_PUBLIC_REVIEW_HIGHLIGHTER_ENGINE=native` only when you explicitly want to test the native Shiki engine.

Inspect the resolved Expo config for a variant:

```bash
vp run config:dev
vp run config:preview
```

Run static checks for mobile native code:

```bash
node ../../scripts/mobile-native-static-check.ts
```

The native lint task runs SwiftLint for Swift plus ktlint and detekt for Kotlin. Missing native tools are reported as warnings and skipped locally. CI installs the default toolset from `apps/mobile/Brewfile` before running the native checks.

## EAS Builds

Preview and production variants use Expo fingerprinting so OTA updates only reach binaries with matching native dependencies, config plugins, and patches. CI uses the `preview:dev` profile to reuse a compatible native build when possible.

The development variant uses `appVersion` to avoid recalculating the native fingerprint for each Metro launch manifest. `MOBILE_VERSION_POLICY` can override either default. If you distribute a custom Release build with the development identity and publish OTA updates to it, set `MOBILE_VERSION_POLICY=fingerprint` for both its build and updates. Changing the runtime policy requires a native rebuild for OTA matching; an existing dev client can still load local Metro bundles.

For preview or production EAS environments, set `T3CODE_CLERK_PUBLISHABLE_KEY`,
`T3CODE_CLERK_JWT_TEMPLATE`, and `T3CODE_RELAY_URL`
as EAS environment variables. Expo config maps the canonical values into the mobile build.

Create a PR preview dev-client build manually:

```bash
vp run eas:ios:preview:dev
```

Create a cloud dev-client build:

```bash
vp run eas:ios:dev
```

Create a persistent preview build:

```bash
vp run eas:ios:preview
```

Android equivalents:

```bash
vp run eas:android:dev
vp run eas:android:preview:dev
vp run eas:android:preview
```
