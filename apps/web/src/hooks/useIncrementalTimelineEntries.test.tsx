import { act, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import type { TimelineEntriesInput } from "../session-logic";
import { makeStreamingTimelineFixture } from "../test-fixtures";
import { useIncrementalTimelineEntries } from "./useIncrementalTimelineEntries";

let renderer: ReactTestRenderer | undefined;
let entries: ReturnType<typeof useIncrementalTimelineEntries> = [];

function Timeline({
  threadKey,
  items,
}: {
  threadKey: string;
  items: TimelineEntriesInput["visibleTurnItems"];
}) {
  const next = useIncrementalTimelineEntries(threadKey, {
    visibleTurnItems: items,
    optimisticMessages: [],
    anchoredMessages: [],
    attachmentUrlById: new Map(),
  });
  useLayoutEffect(() => {
    entries = next;
  }, [next]);
  return null;
}

async function renderTimeline(threadKey: string, items: TimelineEntriesInput["visibleTurnItems"]) {
  await act(() => {
    if (renderer) renderer.update(<Timeline threadKey={threadKey} items={items} />);
    else renderer = create(<Timeline threadKey={threadKey} items={items} />);
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  entries = [];
  vi.unstubAllGlobals();
});

it("updates with fresh input collections without rerendering in a loop", async () => {
  const { visibleTurnItems } = makeStreamingTimelineFixture("Partial");
  await renderTimeline("thread-one", visibleTurnItems);
  const before = entries;

  await renderTimeline("thread-one", visibleTurnItems);
  expect(entries).toBe(before);

  const last = visibleTurnItems.at(-1)!;
  if (last.item.type !== "assistant_message") throw new Error("Expected assistant fixture");
  const updated = {
    ...last,
    item: { ...last.item, text: "Next token" },
  };
  await renderTimeline("thread-one", [...visibleTurnItems.slice(0, -1), updated]);
  expect(entries.slice(0, -1)).toEqual(before.slice(0, -1));
  expect(entries[0]).toBe(before[0]);
  expect(entries.at(-1)).toMatchObject({ message: { text: "Next token" } });
  expect(before.at(-1)).toMatchObject({ message: { text: "Partial" } });
});

it("starts a new projection when switching threads", async () => {
  const { visibleTurnItems } = makeStreamingTimelineFixture("Partial");
  await renderTimeline("thread-one", visibleTurnItems);
  const before = entries;
  await renderTimeline("thread-two", visibleTurnItems);
  expect(entries).toEqual(before);
  expect(entries).not.toBe(before);
  expect(entries[0]).not.toBe(before[0]);

  await renderTimeline("thread-two", []);
  expect(entries).toEqual([]);
});
