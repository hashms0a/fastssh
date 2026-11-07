import { describe, expect, it } from "vitest";
import { create } from "zustand";
import type { StateCreator } from "zustand";
import {
  activeTabOf,
  createTabsSlice,
  hostHasUnread,
  nextTabTitle,
  tabCountOf,
  tabIdsOf,
  type TabsSlice,
  type TerminalTab,
} from "./tabsSlice";

const makeStore = () => create<TabsSlice>()(createTabsSlice as StateCreator<TabsSlice, [], [], TabsSlice>);

const tab = (id: string, hostId: string, over: Partial<TerminalTab> = {}): TerminalTab => ({
  id,
  hostId,
  sessionId: `s-${id}`,
  title: id,
  unread: false,
  loggedIn: false,
  exited: false,
  exitCode: null,
  ...over,
});

describe("tabsSlice", () => {
  it("adds tabs per host and activates the newest", () => {
    const s = makeStore();
    s.getState().addTab(tab("a", "h1"));
    s.getState().addTab(tab("b", "h1"));
    s.getState().addTab(tab("c", "h2"));
    expect(tabIdsOf(s.getState(), "h1")).toEqual(["a", "b"]);
    expect(tabCountOf(s.getState(), "h2")).toBe(1);
    expect(activeTabOf(s.getState(), "h1")).toBe("b");
    expect(activeTabOf(s.getState(), "h2")).toBe("c");
  });

  it("names later tabs with a counter", () => {
    expect(nextTabTitle("Localhost", 0)).toBe("Localhost");
    expect(nextTabTitle("Localhost", 1)).toBe("Localhost (2)");
    expect(nextTabTitle("Localhost", 3)).toBe("Localhost (4)");
  });

  it("moves the active tab to a neighbour when one closes", () => {
    const s = makeStore();
    const st = s.getState();
    st.addTab(tab("a", "h1"));
    st.addTab(tab("b", "h1"));
    st.addTab(tab("c", "h1"));
    s.getState().setActiveTab("h1", "a");
    s.getState().removeTab("a");
    expect(tabIdsOf(s.getState(), "h1")).toEqual(["b", "c"]);
    expect(activeTabOf(s.getState(), "h1")).toBe("b");
    s.getState().removeTab("c"); // last remaining -> active falls back to b
    expect(activeTabOf(s.getState(), "h1")).toBe("b");
    s.getState().removeTab("b");
    expect(tabCountOf(s.getState(), "h1")).toBe(0);
    expect(activeTabOf(s.getState(), "h1")).toBeNull();
    expect(s.getState().tabOrder.h1).toBeUndefined(); // an empty notebook unmounts
  });

  it("dropping the host takes its whole notebook with it", () => {
    const s = makeStore();
    const st = s.getState();
    st.addTab(tab("a", "h1"));
    st.addTab(tab("b", "h2"));
    s.getState().dropHostTabs("h1");
    expect(s.getState().tabs.a).toBeUndefined();
    expect(s.getState().tabs.b).toBeDefined();
    expect(s.getState().tabOrder.h1).toBeUndefined();
  });

  it("focusing a tab clears its unread dot, and the row badge follows", () => {
    const s = makeStore();
    const st = s.getState();
    st.addTab(tab("a", "h1"));
    st.addTab(tab("b", "h1"));
    s.getState().setTabUnread("b", true);
    expect(hostHasUnread(s.getState(), "h1")).toBe(true);
    s.getState().setActiveTab("h1", "b");
    expect(hostHasUnread(s.getState(), "h1")).toBe(false);
    expect(s.getState().tabs.b?.unread).toBe(false);
    s.getState().setTabUnread("b", true);
    s.getState().removeTab("b");
    expect(hostHasUnread(s.getState(), "h1")).toBe(false);
  });

  it("records login, exit and a new session id (Retry keeps the tab)", () => {
    const s = makeStore();
    s.getState().addTab(tab("a", "h1"));
    s.getState().setTabLoggedIn("a");
    s.getState().setTabSession("a", "s2");
    s.getState().setTabExited("a", 255);
    const t = s.getState().tabs.a;
    expect(t).toMatchObject({ loggedIn: true, sessionId: "s2", exited: true, exitCode: 255 });
    expect(s.getState().tabs.zz).toBeUndefined(); // unknown tab ids are ignored
    s.getState().setTabUnread("zz", true);
    s.getState().removeTab("zz");
  });
});
