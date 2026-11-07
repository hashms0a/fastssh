import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, act } from "@testing-library/react";
import { SourceListView } from "./SourceListView";
import { useAppStore } from "../../store/useAppStore";
import { DEFAULT_SETTINGS, LOCALHOST_HOST, type Host } from "../../types/models";
import { installIpcMock, emptyReport, callsTo, type MockBackend } from "../../test/ipcMock";

function host(name: string, group: string, extra: Partial<Host> = {}): Host {
  return { ...LOCALHOST_HOST, ...extra, id: name, name, group, local: undefined };
}

let backend: MockBackend;

beforeEach(() => {
  backend = installIpcMock();
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

  it("a double-click on a row calls the connect handler (toast stub)", () => {
    render(<SourceListView />);
    useAppStore.setState({ toasts: [] });
    fireEvent.doubleClick(screen.getAllByTestId("host-row")[0]!); // Localhost row
    expect(useAppStore.getState().toasts).toHaveLength(1);
  });

  it("shows accounts sorted on the Accounts side", () => {
    act(() => useAppStore.getState().setSidebarMode("accounts"));
    render(<SourceListView />);
    const rows = [...document.querySelectorAll('[data-testid="account-row"]')];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute("data-name")).toBe("lab-key");
  });
});
