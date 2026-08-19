import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";

const automationOwnedTabsByThread = new Map<string, Set<string>>();

export function markPreviewTabAutomationOwned(threadRef: ScopedThreadRef, tabId: string): void {
  const threadKey = scopedThreadKey(threadRef);
  const tabs = automationOwnedTabsByThread.get(threadKey) ?? new Set<string>();
  tabs.add(tabId);
  automationOwnedTabsByThread.set(threadKey, tabs);
}

export function releaseAutomationOwnedPreviewTabs(threadRef: ScopedThreadRef): readonly string[] {
  const threadKey = scopedThreadKey(threadRef);
  const tabs = automationOwnedTabsByThread.get(threadKey);
  if (!tabs) return [];
  automationOwnedTabsByThread.delete(threadKey);
  return [...tabs];
}
