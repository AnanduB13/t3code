import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  PreviewAutomationHost,
  PreviewAutomationStatus,
  PreviewAutomationError,
} from "./previewAutomation.ts";

const decodeAutomationError = Schema.decodeUnknownSync(PreviewAutomationError);
const decodeAutomationHost = Schema.decodeUnknownSync(PreviewAutomationHost);
const decodeAutomationStatus = Schema.decodeUnknownSync(PreviewAutomationStatus);

describe("PreviewAutomationHost", () => {
  it("accepts legacy hosts and current operation advertisements", () => {
    expect(decodeAutomationHost({ clientId: "legacy", environmentId: "environment-1" })).toEqual({
      clientId: "legacy",
      environmentId: "environment-1",
    });
    expect(
      decodeAutomationHost({
        clientId: "current",
        environmentId: "environment-1",
        supportedOperations: ["status", "resize"],
      }).supportedOperations,
    ).toEqual(["status", "resize"]);
  });
});

describe("PreviewAutomationError", () => {
  it("directs agents to recover the server-owned browser when its host is unavailable", () => {
    const error = decodeAutomationError({
      _tag: "PreviewAutomationNoAvailableHostError",
      operation: "status",
      environmentId: "environment-1",
      threadId: "thread-1",
      providerSessionId: "provider-session-1",
      providerInstanceId: "codex",
    });

    expect(error.message).toContain("Retry preview_status, then call preview_open");
    expect(error.message).toContain("report the browser connection failure");
  });

  it("preserves a typed non-editable target failure", () => {
    const error = decodeAutomationError({
      _tag: "PreviewAutomationTargetNotEditableError",
      operation: "type",
      environmentId: "environment-1",
      threadId: "thread-1",
      providerSessionId: "provider-session-1",
      providerInstanceId: "codex",
      clientId: "client-1",
      connectionId: "connection-1",
      requestId: "request-1",
      tabId: "tab-1",
      timeoutMs: 1_000,
      remoteTag: "PreviewAutomationTargetNotEditableError",
      remoteMessageLength: 12,
      cause: {},
      selectorKind: "focused-element",
    });

    expect(error._tag).toBe("PreviewAutomationTargetNotEditableError");
    if (error._tag === "PreviewAutomationTargetNotEditableError") {
      expect(error.selectorKind).toBe("focused-element");
      expect(error.message).toBe("Preview automation type requires an editable focused element.");
    }
  });
});

describe("PreviewAutomationStatus", () => {
  it("accepts old hosts without viewport data and exposes it from current hosts", () => {
    const base = {
      available: true,
      visible: false,
      tabId: "preview-t",
      url: "https://example.com",
      title: "Example",
      loading: false,
    };
    expect(decodeAutomationStatus(base)).toEqual(base);
    expect(
      decodeAutomationStatus({
        ...base,
        viewportSetting: { _tag: "preset", presetId: "pixel-8", width: 412, height: 915 },
        viewport: { width: 412, height: 915 },
      }).viewport,
    ).toEqual({ width: 412, height: 915 });
  });
});
