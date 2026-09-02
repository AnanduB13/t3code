export type AppVariant = "development" | "preview" | "production";

export const MOBILE_EDITION_LABEL = "After Dark";
export const MOBILE_PRODUCT_NAME = `T3 Code: ${MOBILE_EDITION_LABEL}`;
export const DEFAULT_ANDROID_PACKAGE_BASE = "com.anandub13.t3code.afterdark";

const ANDROID_PACKAGE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const EXPO_PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveMobileAppIdentity(
  appVariant: AppVariant,
  androidPackageBase = DEFAULT_ANDROID_PACKAGE_BASE,
) {
  const packageBase = androidPackageBase.trim();
  if (!ANDROID_PACKAGE_PATTERN.test(packageBase)) {
    throw new Error(
      "T3CODE_ANDROID_PACKAGE must be a lowercase reverse-DNS identifier such as com.example.t3code.afterdark.",
    );
  }

  switch (appVariant) {
    case "development":
      return {
        appName: "After Dark Dev",
        androidPackage: `${packageBase}.dev`,
        scheme: "t3code-after-dark-dev",
      } as const;
    case "preview":
      return {
        appName: "After Dark Nightly",
        androidPackage: `${packageBase}.preview`,
        scheme: "t3code-after-dark-preview",
      } as const;
    case "production":
      return {
        appName: MOBILE_PRODUCT_NAME,
        androidPackage: packageBase,
        scheme: "t3code-after-dark",
      } as const;
  }
}

export function resolveExpoProjectId(value: string | undefined): string | null {
  const projectId = value?.trim();
  if (!projectId) return null;
  if (!EXPO_PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error("T3CODE_MOBILE_EAS_PROJECT_ID must be a UUID from an After Dark Expo project.");
  }
  return projectId;
}
