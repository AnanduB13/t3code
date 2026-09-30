import { expect, it } from "vite-plus/test";
import { directChatNotificationsEnabled } from "./directNotificationPreferences";

it("enables new installations while respecting saved notification choices", () => {
  expect(directChatNotificationsEnabled({})).toBe(true);
  expect(directChatNotificationsEnabled({ androidChatNotificationsEnabled: false })).toBe(false);
  expect(directChatNotificationsEnabled({ androidChatNotificationsEnabled: true })).toBe(true);
  expect(
    directChatNotificationsEnabled({
      directChatNotificationsEnabled: false,
      androidChatNotificationsEnabled: true,
    }),
  ).toBe(false);
  expect(
    directChatNotificationsEnabled({
      directChatNotificationsEnabled: true,
      androidChatNotificationsEnabled: false,
    }),
  ).toBe(true);
});
