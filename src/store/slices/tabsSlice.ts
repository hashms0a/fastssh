import type { StateCreator } from "zustand";
import type { AppStore } from "../useAppStore";

/** One terminal tab (task 4.7). `sessionId` changes on Retry (Stage 5);
 *  `id` survives, so listeners and the registry entry stay tied to the tab. */
export interface TerminalTab {
  id: string;
  hostId: string;
  sessionId: string;
  title: string;
  unread: boolean;
  loggedIn: boolean;
  exited: boolean;
  exitCode: number | null;
}

export interface TabsSlice {
  tabs: Record<string, TerminalTab>;
  /** Host-owned notebooks (R10): tab ids per host, in open order. */
  tabOrder: Record<string, string[]>;
  activeTabByHost: Record<string, string | null>;
  addTab: (tab: TerminalTab) => void;
  removeTab: (tabId: string) => void;
  /** Drops every tab of a host (used when the host itself is removed). */
  dropHostTabs: (hostId: string) => void;
  setActiveTab: (hostId: string, tabId: string | null) => void;
  /** Ctrl+Shift+Left/Right (R17): wrap to the previous/next tab of the host. */
  cycleActiveTab: (hostId: string, dir: 1 | -1) => void;
  /**
   * PTY output for a tab (task 6.7, R13). Writes the store at most once per
   * unread episode, and never for the tab the user is looking at.
   */
  markOutput: (tabId: string, windowFocused: boolean) => void;
  /** Window regained focus: the tab in front has nothing unread left.
   *  `selectedHostId` comes from the ui slice (the store is combined). */
  clearUnreadOfActiveTab: (windowFocused: boolean) => void;
  setTabSession: (tabId: string, sessionId: string) => void;
  setTabUnread: (tabId: string, unread: boolean) => void;
  setTabLoggedIn: (tabId: string) => void;
  /** Retry (task 5.7): the tab keeps its id; its login/exit flags start fresh. */
  resetTabFlags: (tabId: string) => void;
  setTabExited: (tabId: string, code: number) => void;
}

/** Titles: the host name, then " (2)", " (3)" … for later tabs. */
export function nextTabTitle(hostName: string, existing: number): string {
  return existing === 0 ? hostName : `${hostName} (${existing + 1})`;
}

export const tabIdsOf = (s: { tabOrder: Record<string, string[]> }, hostId: string): string[] =>
  s.tabOrder[hostId] ?? [];
export const tabCountOf = (s: { tabOrder: Record<string, string[]> }, hostId: string): number =>
  tabIdsOf(s, hostId).length;
export const activeTabOf = (s: { activeTabByHost: Record<string, string | null> }, hostId: string): string | null =>
  s.activeTabByHost[hostId] ?? null;
export const hostHasUnread = (
  s: { tabOrder: Record<string, string[]>; tabs: Record<string, TerminalTab> },
  hostId: string,
): boolean => tabIdsOf(s, hostId).some((id) => s.tabs[id]?.unread === true);

/** Neighbour to activate when a tab closes: the one after it, else the last. */
function nextActive(order: string[], closedIndex: number): string | null {
  const remaining = order.filter((id) => id !== order[closedIndex]);
  if (remaining.length === 0) return null;
  return remaining[Math.min(closedIndex, remaining.length - 1)] ?? null;
}

export const createTabsSlice: StateCreator<AppStore, [], [], TabsSlice> = (set, get) => ({
  tabs: {},
  tabOrder: {},
  activeTabByHost: {},

  addTab: (tab) => {
    const s = get();
    const order = tabIdsOf(s, tab.hostId);
    set({
      tabs: { ...s.tabs, [tab.id]: tab },
      tabOrder: { ...s.tabOrder, [tab.hostId]: [...order, tab.id] },
      activeTabByHost: { ...s.activeTabByHost, [tab.hostId]: tab.id },
    });
  },

  removeTab: (tabId) => {
    const s = get();
    const tab = s.tabs[tabId];
    if (!tab) return;
    const tabs = { ...s.tabs };
    delete tabs[tabId];
    const order = tabIdsOf(s, tab.hostId).filter((id) => id !== tabId);
    const active = { ...s.activeTabByHost };
    if (active[tab.hostId] === tabId) {
      const index = tabIdsOf(s, tab.hostId).indexOf(tabId);
      active[tab.hostId] = nextActive(tabIdsOf(s, tab.hostId), index);
    }
    const orderMap = { ...s.tabOrder };
    if (order.length === 0) delete orderMap[tab.hostId];
    else orderMap[tab.hostId] = order;
    set({ tabs, tabOrder: orderMap, activeTabByHost: active });
  },

  dropHostTabs: (hostId) => {
    const s = get();
    const ids = tabIdsOf(s, hostId);
    if (ids.length === 0) return;
    const tabs = { ...s.tabs };
    for (const id of ids) delete tabs[id];
    const tabOrder = { ...s.tabOrder };
    delete tabOrder[hostId];
    const activeTabByHost = { ...s.activeTabByHost };
    delete activeTabByHost[hostId];
    set({ tabs, tabOrder, activeTabByHost });
  },

  // Focusing a tab clears its unread dot (R13).
  setActiveTab: (hostId, tabId) => {
    const s = get();
    const tabs = { ...s.tabs };
    if (tabId && tabs[tabId]) tabs[tabId] = { ...tabs[tabId], unread: false };
    set({ tabs, activeTabByHost: { ...s.activeTabByHost, [hostId]: tabId } });
  },

  cycleActiveTab: (hostId, dir) => {
    const s = get();
    const order = tabIdsOf(s, hostId);
    if (order.length === 0) return;
    const current = activeTabOf(s, hostId);
    const index = current ? order.indexOf(current) : 0;
    const next = (((index + dir) % order.length) + order.length) % order.length;
    const tabId = order[next]!;
    const tabs = { ...s.tabs };
    if (tabs[tabId]) tabs[tabId] = { ...tabs[tabId], unread: false };
    set({ tabs, activeTabByHost: { ...s.activeTabByHost, [hostId]: tabId } });
  },

  markOutput: (tabId, windowFocused) => {
    const s = get();
    const tab = s.tabs[tabId];
    if (!tab || tab.unread) return; // one store write per unread episode, not per chunk
    const visible =
      windowFocused && s.sidebarMode === "hosts" && (s.activeTabByHost[s.selectedHostId ?? ""] ?? null) === tabId;
    if (visible) return;
    set({ tabs: { ...s.tabs, [tabId]: { ...tab, unread: true } } });
  },

  clearUnreadOfActiveTab: (windowFocused) => {
    if (!windowFocused) return;
    const s = get();
    const active = s.selectedHostId ? (s.activeTabByHost[s.selectedHostId] ?? null) : null;
    const tab = active ? s.tabs[active] : undefined;
    if (!tab || tab.unread !== true) return;
    set({ tabs: { ...s.tabs, [tab.id]: { ...tab, unread: false } } });
  },

  setTabSession: (tabId, sessionId) => {
    const s = get();
    const tab = s.tabs[tabId];
    if (tab) set({ tabs: { ...s.tabs, [tabId]: { ...tab, sessionId } } });
  },

  setTabUnread: (tabId, unread) => {
    const s = get();
    const tab = s.tabs[tabId];
    if (tab && tab.unread !== unread) set({ tabs: { ...s.tabs, [tabId]: { ...tab, unread } } });
  },

  setTabLoggedIn: (tabId) => {
    const s = get();
    const tab = s.tabs[tabId];
    if (tab) set({ tabs: { ...s.tabs, [tabId]: { ...tab, loggedIn: true } } });
  },

  setTabExited: (tabId, code) => {
    const s = get();
    const tab = s.tabs[tabId];
    if (tab) set({ tabs: { ...s.tabs, [tabId]: { ...tab, exited: true, exitCode: code } } });
  },

  resetTabFlags: (tabId) => {
    const s = get();
    const tab = s.tabs[tabId];
    if (!tab) return;
    set({
      tabs: {
        ...s.tabs,
        [tabId]: { ...tab, loggedIn: false, exited: false, exitCode: null, unread: false },
      },
    });
  },
});
