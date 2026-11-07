import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, act } from "@testing-library/react";
import { SourceListView } from "./SourceListView";
import { useAppStore } from "../../store/useAppStore";
import { DEFAULT_SETTINGS, LOCALHOST_HOST, type Host } from "../../types/models";
import { tabIdsOf } from "../../store/slices/tabsSlice";
import { installIpcMock, emptyReport, callsTo, type MockBackend } from "../../test/ipcMock";

function host(name: string, group: string, extra: Partial<Host> = {}): Host {
  return { ...LOCALHOST_HOST, ...extra, id: name, name, group, local: undefined };
}

let backend: MockBackend;

beforeEach(() => {
  backend = installIpcMock();
  // Tabs are per-run state; hydrate does not touch them.
  useAppStore.setState({ tabs: {}, tabOrder: {}, activeTabByHost: {} });
  useAppStore.getState().hydrate(
    emptyReport({
      hosts: [
        host("item10", "Lab", { host: "127.0.0.1", port: 2222, username: "tester" }),
        host("item2", "Lab", { host: "127.0.0.1", account: "lab-key" }),
        host("my-server", "Unreachable"),
        host("bad-port", "Broken"),
        host("Сервер-1", "Unreachable"),
      ],
      accounts: [{ id: "a1", name: "lab-key", username: "keyuser", password: "", identity_file: "" }],
      settings: DEFAULT_SETTINGS,
    }),
  );
});

const groupOrder = () =>
  [...document.querySelectorAll('[data-testid^="group-"]')]
    .map((el) => el.getAttribute("data-testid") ?? "")
    .filter((id) => !id.startsWith("group-header") && !id.startsWith("group-count"))
    .map((id) => id.slice("group-".length));

const rowNames = () =>
  [...document.querySelectorAll('[data-testid="host-row"]')].map((el) => el.getAttribute("data-name"));

describe("SourceListView (Stage 2)", () => {
  it("shows Local first, groups naturally sorted, item2 before item10", () => {
    render(<SourceListView />);
    expect(groupOrder()).toEqual(["Local", "Broken", "Lab", "Unreachable"]);
    expect(rowNames()).toEqual(["Localhost", "bad-port", "item2", "item10", "my-server", "Сервер-1"]);
  });

  it("Localhost is injected at the front by hydrate", () => {
    expect(useAppStore.getState().hosts[0]?.id).toBe(LOCALHOST_HOST.id);
  });

  it("filters on name/host/username/group (case-insensitive) without touching selection", () => {
    render(<SourceListView />);
    const setFilter = (f: string) => act(() => useAppStore.getState().setFilter(f));
    setFilter("item");
    expect(groupOrder()).toEqual(["Lab"]);
    expect(rowNames()).toEqual(["item2", "item10"]);
    useAppStore.getState().selectHost("item10");
    setFilter("tester"); // username match
    expect(rowNames()).toEqual(["item10"]);
    setFilter("");
    expect(rowNames()).toContain("Localhost");
    expect(useAppStore.getState().selectedHostId).toBe("item10");
  });

  it("collapse persists through updateSettings (collapsedGroups + save)", () => {
    vi.useFakeTimers();
    render(<SourceListView />);
    fireEvent.click(screen.getByTestId("group-header-Lab"));
    expect(useAppStore.getState().settings.collapsedGroups).toEqual(["Lab"]);
    expect(rowNames()).not.toContain("item2");
    vi.advanceTimersByTime(400);
    expect(callsTo(backend, "save_settings")).toHaveLength(1);
    // Expand again.
    fireEvent.click(screen.getByTestId("group-header-Lab"));
    expect(rowNames()).toContain("item2");
    vi.useRealTimers();
  });

  it("a double-click on a row opens a tab and spawns the local shell", async () => {
    render(<SourceListView />);
    fireEvent.doubleClick(screen.getAllByTestId("host-row")[0]!); // Localhost row
    await vi.waitFor(() => expect(callsTo(backend, "spawn_session")).toHaveLength(1));
    const ids = tabIdsOf(useAppStore.getState(), LOCALHOST_HOST.id);
    expect(ids).toHaveLength(1);
    const args = callsTo(backend, "spawn_session")[0]!.args;
    expect((args.host as Host).local).toBe(true);
    expect(args.sessionId).toBe(useAppStore.getState().tabs[ids[0]!]?.sessionId);
  });

  it("shows the open-tab count and the unread dot on a row (task 4.13, R13)", () => {
    render(<SourceListView />);
    act(() =>
      useAppStore.getState().addTab({
        id: "t1",
        hostId: "item10",
        sessionId: "s1",
        title: "item10",
        unread: false,
        loggedIn: false,
        exited: false,
        exitCode: null,
      }),
    );
    act(() =>
      useAppStore.getState().addTab({
        id: "t2",
        hostId: "item10",
        sessionId: "s2",
        title: "item10 (2)",
        unread: true,
        loggedIn: false,
        exited: false,
        exitCode: null,
      }),
    );
    const row = [...document.querySelectorAll<HTMLElement>('[data-testid="host-row"]')].find(
      (el) => el.getAttribute("data-name") === "item10",
    )!;
    const badge = row.querySelector('[data-testid="host-row-badge"]')!;
    expect(badge.textContent).toBe("2");
    expect(badge.className).not.toContain("hidden");
    expect(row.querySelector('[data-testid="host-row-unread"]')!.className).not.toContain("hidden");
    // A host without tabs keeps both slots hidden.
    const local = [...document.querySelectorAll<HTMLElement>('[data-testid="host-row"]')].find(
      (el) => el.getAttribute("data-name") === "Localhost",
    )!;
    expect(local.querySelector('[data-testid="host-row-badge"]')!.className).toContain("hidden");
  });

  it("shows accounts sorted on the Accounts side", () => {
    act(() => useAppStore.getState().setSidebarMode("accounts"));
    render(<SourceListView />);
    const rows = [...document.querySelectorAll('[data-testid="account-row"]')];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute("data-name")).toBe("lab-key");
  });
});
