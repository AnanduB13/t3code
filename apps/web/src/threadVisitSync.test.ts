import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { createThreadVisitSync, type ThreadVisit } from "./threadVisitSync";

const early = "2026-09-01T10:00:00.000Z";
const completed = "2026-09-01T10:05:00.000Z";
const thread = (lastVisitedAt: string | null, environment = "env") => ({
  id: ThreadId.make("thread"),
  environmentId: EnvironmentId.make(environment),
  lastVisitedAt,
});
function client(send: (visit: ThreadVisit) => Promise<boolean> = async () => true) {
  const local: Record<string, string | undefined> = {};
  const sync = createThreadVisitSync({
    readLocal: (key) => local[key],
    apply: (key, value) => {
      local[key] = value;
    },
    send,
  });
  return { local, sync };
}

describe("shared thread visits", () => {
  it("clears a second client's completion and preserves mark unread across reconnect", () => {
    const desktop = client();
    const remote = client();
    for (const c of [desktop, remote]) c.sync.update([thread(early)]);
    for (const c of [desktop, remote]) c.sync.update([thread(completed)]);
    expect(remote.local["env:thread"]).toBe(completed);
    for (const c of [desktop, remote]) c.sync.update([thread(early)]);
    const reconnected = client();
    reconnected.sync.update([thread(early)]);
    expect(reconnected.local).toEqual(remote.local);
    expect(desktop.local["env:thread"]).toBe(early);
  });

  it("isolates matching thread IDs in different environments and sends no echo", () => {
    const send = vi.fn(async () => true);
    const { sync, local } = client(send);
    sync.update([thread(completed), thread(early, "other")]);
    expect(local).toEqual({ "env:thread": completed, "other:thread": early });
    sync.visit({ threadKey: "env:thread", visitedAt: completed });
    expect(send).not.toHaveBeenCalled();
  });

  it("migrates local history only when the server has no record", async () => {
    const send = vi.fn(async () => true);
    const { sync, local } = client(send);
    local["env:thread"] = completed;
    sync.update([thread(null)]);
    await Promise.resolve();
    expect(send).toHaveBeenCalledExactlyOnceWith({ threadKey: "env:thread", visitedAt: completed });
    sync.update([thread(early)]);
    expect(local["env:thread"]).toBe(early);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("restores canonical state after a rejected acknowledgement", async () => {
    let finish: ((success: boolean) => void) | undefined;
    const { sync, local } = client(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    sync.update([thread(early)]);
    local["env:thread"] = completed;
    sync.visit({ threadKey: "env:thread", visitedAt: completed });
    await Promise.resolve();
    finish!(false);
    await Promise.resolve();
    expect(local["env:thread"]).toBe(early);
  });
  it("serializes read then unread and does not roll back a newer local action", async () => {
    const send = vi.fn<(visit: ThreadVisit) => Promise<boolean>>(async () => false);
    const { sync, local } = client(send);
    sync.update([thread(early)]);
    const unreadAt = new Date(Date.parse(early) - 1).toISOString();
    const read = sync.visit({ threadKey: "env:thread", visitedAt: completed });
    local["env:thread"] = unreadAt;
    const unread = sync.visit({ threadKey: "env:thread", visitedAt: unreadAt, markUnread: true });
    await read;
    expect(local["env:thread"]).toBe(unreadAt);
    await unread;
    expect(send.mock.calls.map(([visit]) => visit)).toEqual([
      { threadKey: "env:thread", visitedAt: completed },
      { threadKey: "env:thread", visitedAt: unreadAt, markUnread: true },
    ]);
  });
});
