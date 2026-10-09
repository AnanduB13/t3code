import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_ANDROID_PACKAGE_BASE,
  MOBILE_EDITION_LABEL,
  MOBILE_PRODUCT_NAME,
  resolveExpoProjectId,
  resolveMobileAppIdentity,
} from "./mobileBranding";

describe("After Dark mobile identity", () => {
  it.each([
    [
      "development",
      {
        appName: "After Dark Dev",
        androidPackage: `${DEFAULT_ANDROID_PACKAGE_BASE}.dev`,
        scheme: "t3code-after-dark-dev",
      },
    ],
    [
      "preview",
      {
        appName: "After Dark Nightly",
        androidPackage: `${DEFAULT_ANDROID_PACKAGE_BASE}.preview`,
        scheme: "t3code-after-dark-preview",
      },
    ],
    [
      "production",
      {
        appName: MOBILE_PRODUCT_NAME,
        androidPackage: DEFAULT_ANDROID_PACKAGE_BASE,
        scheme: "t3code-after-dark",
      },
    ],
  ] as const)("gives %s builds a separate install identity", (appVariant, expected) => {
    expect(resolveMobileAppIdentity(appVariant)).toEqual(expected);
  });

  it("supports an owner-controlled Android package", () => {
    expect(resolveMobileAppIdentity("production", "dev.example.afterdark").androidPackage).toBe(
      "dev.example.afterdark",
    );
  });

  it("rejects an Android package that could not be published", () => {
    expect(() => resolveMobileAppIdentity("production", "T3 Code After Dark")).toThrow(
      "T3CODE_ANDROID_PACKAGE",
    );
  });

  it("only enables an explicitly configured Expo project", () => {
    expect(resolveExpoProjectId(undefined)).toBeNull();
    expect(resolveExpoProjectId("d763fcb8-d37c-41ea-a773-b54a0ab4a454")).toBe(
      "d763fcb8-d37c-41ea-a773-b54a0ab4a454",
    );
    expect(() => resolveExpoProjectId("official-project")).toThrow("T3CODE_MOBILE_EAS_PROJECT_ID");
  });

  it("keeps the edition label explicit", () => {
    expect(MOBILE_EDITION_LABEL).toBe("After Dark");
  });
});
