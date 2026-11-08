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
import { createUiSlice, type UiSlice } from "./uiSlice";

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

describe("Stage 11: reorder and rename", () => {
  const three = () => {
    const s = makeStore();
    const st = s.getState();
    st.addTab(tab("a", "h1"));
    st.addTab(tab("b", "h1"));
    st.addTab(tab("c", "h1"));
    return s;
  };

  it("a drop moves the dragged tab into the target's slot", () => {
    const s = three();
    s.getState().moveTab("h1", "c", "a");
    expect(tabIdsOf(s.getState(), "h1")).toEqual(["c", "a", "b"]);
    s.getState().moveTab("h1", "c", "b");
    expect(tabIdsOf(s.getState(), "h1")).toEqual(["a", "b", "c"]);
  });

  it("reorder keeps the active tab and ignores a drop from another host", () => {
    const s = three();
    s.getState().setActiveTab("h1", "b");
    s.getState().moveTab("h1", "a", "c");
    expect(tabIdsOf(s.getState(), "h1")).toEqual(["b", "c", "a"]);
    expect(activeTabOf(s.getState(), "h1")).toBe("b");
    s.getState().moveTab("h1", "zz", "a"); // an id of another notebook
    expect(tabIdsOf(s.getState(), "h1")).toEqual(["b", "c", "a"]);
  });

  it("renaming a tab changes only that tab's title", () => {
    const s = three();
    s.getState().renameTab("b", "  build box  ");
    expect(s.getState().tabs.b?.title).toBe("build box");
    expect(s.getState().tabs.a?.title).toBe("a");
    s.getState().renameTab("b", "   "); // empty keeps the old title
    expect(s.getState().tabs.b?.title).toBe("build box");
    s.getState().renameTab("zz", "x"); // unknown tab id
    expect(s.getState().tabs.zz).toBeUndefined();
  });

  it("a rename does not touch the order or the unread flags", () => {
    const s = three();
    s.getState().setTabUnread("b", true);
    s.getState().renameTab("b", "deploy");
    expect(tabIdsOf(s.getState(), "h1")).toEqual(["a", "b", "c"]);
    expect(s.getState().tabs.b).toMatchObject({ title: "deploy", unread: true });
  });
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

/** Tabs: `a` in the background, `b` in front, both on the selected host h1. */
const tabsOfStore = createTabsSlice as unknown as StateCreator<TabsSlice & UiSlice, [], [], TabsSlice>;
const uiOfStore = createUiSlice as unknown as StateCreator<TabsSlice & UiSlice, [], [], UiSlice>;
const makeLibraryStore = () => create<TabsSlice & UiSlice>()((...a) => ({ ...tabsOfStore(...a), ...uiOfStore(...a) }));

/** Tabs: `a` in the background, `b` in front, both on the selected host h1. */
function twoTabs(s: ReturnType<typeof makeLibraryStore>): void {
  const st = s.getState();
  st.addTab(tab("a", "h1"));
  st.addTab(tab("b", "h1"));
  s.setState({ selectedHostId: "h1", sidebarMode: "hosts" });
}

describe("unread output rule (R13)", () => {
  it("10,000 chunks to a background tab write the store exactly once", () => {
    const s = makeLibraryStore();
    twoTabs(s);
    let writes = 0;
    const stop = s.subscribe(() => writes++);
    for (let i = 0; i < 10000; i++) s.getState().markOutput("a", true);
    stop();
    expect(writes).toBe(1);
    expect(s.getState().tabs.a?.unread).toBe(true);
    expect(hostHasUnread(s.getState(), "h1")).toBe(true);
  });

  it("output in the visible tab marks nothing while the window is focused", () => {
    const s = makeLibraryStore();
    twoTabs(s);
    for (let i = 0; i < 200; i++) s.getState().markOutput("b", true);
    expect(s.getState().tabs.b?.unread).toBe(false);
  });

  it("the same tab becomes unread when the window loses focus", () => {
    const s = makeLibraryStore();
    twoTabs(s);
    s.getState().markOutput("b", false);
    expect(s.getState().tabs.b?.unread).toBe(true);
  });

  it("output marks the active tab too when the sidebar shows Accounts", () => {
    const s = makeLibraryStore();
    twoTabs(s);
    s.getState().setSidebarMode("accounts");
    s.getState().markOutput("b", true);
    expect(s.getState().tabs.b?.unread).toBe(true);
  });

  it("regaining window focus clears the dot of the tab in front only", () => {
    const s = makeLibraryStore();
    twoTabs(s);
    s.getState().markOutput("a", false);
    s.getState().markOutput("b", false);
    s.getState().clearUnreadOfActiveTab(false); // unfocused: nothing clears
    expect(s.getState().tabs.b?.unread).toBe(true);
    s.getState().clearUnreadOfActiveTab(true);
    expect(s.getState().tabs.b?.unread).toBe(false);
    expect(s.getState().tabs.a?.unread).toBe(true); // the hidden tab keeps its dot
    expect(hostHasUnread(s.getState(), "h1")).toBe(true);
  });

  it("Ctrl+Shift+Left/Right wrap around the notebook and clear the new dot", () => {
    const s = makeLibraryStore();
    twoTabs(s);
    const st = s.getState();
    st.addTab(tab("c", "h1"));
    expect(activeTabOf(s.getState(), "h1")).toBe("c");
    s.getState().cycleActiveTab("h1", 1); // wraps to the first tab
    expect(activeTabOf(s.getState(), "h1")).toBe("a");
    s.getState().cycleActiveTab("h1", -1); // wraps to the last
    expect(activeTabOf(s.getState(), "h1")).toBe("c");
    s.getState().setTabUnread("b", true);
    s.getState().cycleActiveTab("h1", -1); // c -> b
    expect(activeTabOf(s.getState(), "h1")).toBe("b");
    expect(hostHasUnread(s.getState(), "h1")).toBe(false);
    s.getState().cycleActiveTab("h2", 1); // a host with no tabs is a no-op
    expect(activeTabOf(s.getState(), "h2")).toBeNull();
  });
});
