const MAX_REMEMBERED_TIMELINES = 100;

const scrollOffsetByThreadKey = new Map<string, number>();

export function getRememberedTimelineScrollOffset(threadKey: string) {
  return scrollOffsetByThreadKey.get(threadKey);
}

export function rememberTimelineScrollOffset(threadKey: string, scrollOffset: number) {
  if (!Number.isFinite(scrollOffset) || scrollOffset < 0) {
    return;
  }

  // Refresh insertion order so the least recently read thread is discarded
  // first. This memory is intentionally session-only: a reload may render
  // different row heights after an update, where an old pixel offset lies.
  scrollOffsetByThreadKey.delete(threadKey);
  scrollOffsetByThreadKey.set(threadKey, scrollOffset);

  if (scrollOffsetByThreadKey.size > MAX_REMEMBERED_TIMELINES) {
    const oldestThreadKey = scrollOffsetByThreadKey.keys().next().value;
    if (oldestThreadKey !== undefined) {
      scrollOffsetByThreadKey.delete(oldestThreadKey);
    }
  }
}

export function forgetTimelineScrollOffset(threadKey: string) {
  scrollOffsetByThreadKey.delete(threadKey);
}

export function clearRememberedTimelineScrollOffsetsForTests() {
  scrollOffsetByThreadKey.clear();
}
