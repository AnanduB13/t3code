import { useLayoutEffect } from "react";
import { expect, it, vi } from "vite-plus/test";

import { render, type Screen } from "../../test/render";
import type { TimelineEntriesInput } from "../session-logic";
import { makeStreamingTimelineFixture } from "../test-fixtures";
import { useIncrementalTimelineEntries } from "./useIncrementalTimelineEntries";

vi.mock("gt-react", async (importOriginal) => {
  const resolve = (message: string) => message;
  return {
    ...(await importOriginal<typeof import("gt-react")>()),
    useLocale: () => "en",
    useMessages: () => resolve,
  };
});

type Entries = ReturnType<typeof useIncrementalTimelineEntries>;
type Items = TimelineEntriesInput["visibleTurnItems"];

function Timeline({
  threadKey,
  items,
  onEntries,
}: {
  threadKey: string;
  items: Items;
  onEntries: (entries: Entries) => void;
}) {
  const next = useIncrementalTimelineEntries(threadKey, {
    visibleTurnItems: items,
    optimisticMessages: [],
    anchoredMessages: [],
    attachmentUrlById: new Map(),
  });
  useLayoutEffect(() => {
    onEntries(next);
  }, [next, onEntries]);
  return null;
}

/** Renders the timeline; `entries()` returns the latest committed result. */
async function renderTimeline(threadKey: string, items: Items) {
  let latest: Entries = [];
  const onEntries = (entries: Entries) => {
    latest = entries;
  };
  const screen: Screen = await render(
    <Timeline threadKey={threadKey} items={items} onEntries={onEntries} />,
  );
  return {
    entries: () => latest,
    update: (nextKey: string, nextItems: Items) =>
      screen.rerender(<Timeline threadKey={nextKey} items={nextItems} onEntries={onEntries} />),
    [Symbol.asyncDispose]: () => screen[Symbol.asyncDispose](),
  };
}

it("updates with fresh input collections without rerendering in a loop", async () => {
  const { visibleTurnItems } = makeStreamingTimelineFixture("Partial");
  await using timeline = await renderTimeline("thread-one", visibleTurnItems);
  const before = timeline.entries();

  await timeline.update("thread-one", visibleTurnItems);
  expect(timeline.entries()).toBe(before);

  const last = visibleTurnItems.at(-1)!;
  if (last.item.type !== "assistant_message") throw new Error("Expected assistant fixture");
  const updated = {
    ...last,
    item: { ...last.item, text: "Next token" },
  };
  await timeline.update("thread-one", [...visibleTurnItems.slice(0, -1), updated]);
  const entries = timeline.entries();
  expect(entries.slice(0, -1)).toEqual(before.slice(0, -1));
  expect(entries[0]).toBe(before[0]);
  expect(entries.at(-1)).toMatchObject({ message: { text: "Next token" } });
  expect(before.at(-1)).toMatchObject({ message: { text: "Partial" } });
});

it("starts a new projection when switching threads", async () => {
  const { visibleTurnItems } = makeStreamingTimelineFixture("Partial");
  await using timeline = await renderTimeline("thread-one", visibleTurnItems);
  const before = timeline.entries();
  await timeline.update("thread-two", visibleTurnItems);
  expect(timeline.entries()).toEqual(before);
  expect(timeline.entries()).not.toBe(before);
  expect(timeline.entries()[0]).not.toBe(before[0]);

  await timeline.update("thread-two", []);
  expect(timeline.entries()).toEqual([]);
});
