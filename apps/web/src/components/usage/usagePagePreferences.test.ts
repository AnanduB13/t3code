import { afterEach, describe, expect, it } from "vite-plus/test";

import { removeLocalStorageItem } from "../../hooks/useLocalStorage";
import { readUsagePagePreferences, saveUsagePagePreferences } from "./usagePagePreferences";

afterEach(() => removeLocalStorageItem("t3code:usage-page-preferences:v1"));

describe("Usage view preferences", () => {
  it("opens account limits on the first visit", () => {
    expect(readUsagePagePreferences()).toEqual({ metric: "limits", windowDays: 30 });
  });

  it("remembers switching to cost or tokens and back to limits", () => {
    for (const metric of ["cost", "tokens", "limits"] as const) {
      saveUsagePagePreferences({ metric, windowDays: 7 });
      expect(readUsagePagePreferences()).toEqual({ metric, windowDays: 7 });
    }
  });
});
