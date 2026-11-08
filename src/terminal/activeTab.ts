import { useAppStore } from "../store/useAppStore";
import { getEntry, type Entry } from "./terminalRegistry";

/**
 * The tab the actions apply to: the active tab of the selected host
 * (R10/R17). Split out so the terminal actions and the search controller
 * share one lookup without importing each other.
 */
export function activeTabId(): string | null {
  const s = useAppStore.getState();
  return s.selectedHostId ? (s.activeTabByHost[s.selectedHostId] ?? null) : null;
}

export function activeEntry(): Entry | undefined {
  const id = activeTabId();
  return id ? getEntry(id) : undefined;
}

/** An entry for a specific tab (the context menu knows its own tab id). */
export const entryOf = (tabId?: string): Entry | undefined => (tabId ? getEntry(tabId) : activeEntry());
