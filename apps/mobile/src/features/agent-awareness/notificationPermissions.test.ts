import { vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import { beforeEach, describe, expect, it } from "@effect/vitest";
const mocks = vi.hoisted(() => ({
  platform: { OS: "android" },
  channel: vi.fn(async () => null),
  get: vi.fn(async () => ({ granted: false, canAskAgain: true })),
  request: vi.fn(async () => ({ granted: true, canAskAgain: true })),
}));
vi.mock("react-native", () => ({ Platform: mocks.platform }));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: mocks.channel,
  getPermissionsAsync: mocks.get,
  requestPermissionsAsync: mocks.request,
}));
import { requestAgentNotificationPermission } from "./notificationPermissions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.platform.OS = "android";
  mocks.get.mockResolvedValue({ granted: false, canAskAgain: true });
});
describe("chat notification permissions", () => {
  it.effect("creates the Android channel before requesting permission", () =>
    Effect.gen(function* () {
      expect(yield* requestAgentNotificationPermission).toEqual({
        type: "granted",
      });
      expect(mocks.channel.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.request.mock.invocationCallOrder[0]!,
      );
    }),
  );
  it.effect("does not repeatedly prompt after permission is denied permanently", () =>
    Effect.gen(function* () {
      mocks.get.mockResolvedValue({ granted: false, canAskAgain: false });
      expect(yield* requestAgentNotificationPermission).toEqual({
        type: "denied",
        canAskAgain: false,
      });
      expect(mocks.request).not.toHaveBeenCalled();
    }),
  );
  it.effect("preserves iOS permission requests without Android channels", () =>
    Effect.gen(function* () {
      mocks.platform.OS = "ios";
      expect(yield* requestAgentNotificationPermission).toEqual({
        type: "granted",
      });
      expect(mocks.channel).not.toHaveBeenCalled();
    }),
  );
});
