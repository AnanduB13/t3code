import { describe, expect, it } from "vite-plus/test";

import { resolveHermesConnectionState } from "./Agents.logic";

describe("resolveHermesConnectionState", () => {
  it("does not label the initial request as offline", () => {
    expect(resolveHermesConnectionState({ status: null, isPending: true, error: null })).toBe(
      "connecting",
    );
  });

  it("uses offline only for an explicit unavailable response", () => {
    expect(
      resolveHermesConnectionState({
        status: { available: false, endpoint: "http://127.0.0.1:8642" },
        isPending: false,
        error: null,
      }),
    ).toBe("offline");
  });

  it("distinguishes transport errors from Hermes availability", () => {
    expect(
      resolveHermesConnectionState({ status: null, isPending: false, error: "RPC failed" }),
    ).toBe("error");
  });

  it("reports a successful Hermes probe as connected", () => {
    expect(
      resolveHermesConnectionState({
        status: { available: true, endpoint: "http://127.0.0.1:8642" },
        isPending: false,
        error: null,
      }),
    ).toBe("connected");
  });
});
