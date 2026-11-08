import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, LOCALHOST_ID, type Host } from "../../types/models";
import { useAppStore } from "../useAppStore";
import { callsTo, installIpcMock, emptyReport, type MockBackend } from "../../test/ipcMock";
import { strings } from "../../lib/strings";

let backend: MockBackend;

beforeEach(() => {
  backend = installIpcMock();
  useAppStore.setState({
    settings: DEFAULT_SETTINGS,
    hosts: [],
    accounts: [],
    bookmarks: [],
    warnings: [],
    toasts: [],
  });
});

afterEach(() => vi.useRealTimers());

describe("settingsSlice.updateSettings", () => {
  it("merges the patch (copyWith semantics) and debounces save_settings by 400 ms", () => {
    vi.useFakeTimers();
    useAppStore.getState().updateSettings({ windowWidth: 900, audibleBell: false });
    useAppStore.getState().updateSettings({ windowWidth: 910 });
    expect(callsTo(backend, "save_settings")).toHaveLength(0);
    vi.advanceTimersByTime(400);
    const calls = callsTo(backend, "save_settings");
    expect(calls).toHaveLength(1);
    const saved = calls[0]?.args.settings as Record<string, unknown>;
    expect(saved.windowWidth).toBe(910);
    expect(saved.audibleBell).toBe(false);
    expect(saved.windowHeight).toBe(DEFAULT_SETTINGS.windowHeight); // untouched
  });

  it("the debounced save carries the open tabs (crash recovery, task 12.3)", () => {
    vi.useFakeTimers();
    const host: Host = {
      id: "h1",
      name: "web-1",
      group: "",
      host: "10.0.0.1",
      port: 22,
      username: "",
      password: "",
      identity_file: "",
      account: "",
      color: "",
      font: "",
      tunnels: "",
      extra_arguments: "",
      ssh_config: "",
    };
    const tab = {
      id: "t1",
      hostId: "h1",
      sessionId: "s1",
      title: "web-1",
      unread: false,
      loggedIn: false,
      exited: false,
      exitCode: null,
    };
    useAppStore.setState({ hosts: [host], tabOrder: { h1: ["t1"] }, tabs: { t1: tab } });

    useAppStore.getState().updateSettings({ restoreHosts: true, windowWidth: 900 });
    vi.advanceTimersByTime(400);
    const on = callsTo(backend, "save_settings").at(-1)?.args.settings as { openedHosts: unknown };
    expect(on.openedHosts).toEqual([{ hostName: "web-1", tabCount: 1 }]);

    // Restore off: nothing is remembered, same as the quit flow.
    useAppStore.getState().updateSettings({ restoreHosts: false });
    vi.advanceTimersByTime(400);
    const off = callsTo(backend, "save_settings").at(-1)?.args.settings as { openedHosts: unknown };
    expect(off.openedHosts).toEqual(DEFAULT_SETTINGS.openedHosts);
  });

  it("ignores undefined values in the patch", () => {
    useAppStore.getState().updateSettings({ windowWidth: 800, windowHeight: undefined });
    const s = useAppStore.getState().settings;
    expect(s.windowWidth).toBe(800);
    expect(s.windowHeight).toBe(DEFAULT_SETTINGS.windowHeight);
  });

  it("flushSettings saves immediately and cancels the pending debounce", async () => {
    vi.useFakeTimers();
    useAppStore.getState().updateSettings({ panelSize: 300 });
    await useAppStore.getState().flushSettings();
    expect(callsTo(backend, "save_settings")).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(callsTo(backend, "save_settings")).toHaveLength(1);
  });

  it("a failing settings write toasts once, and a later failure is reported again (task 12.1)", async () => {
    backend.failNext("save_settings", "settings.json: Read-only file system (os error 30)");
    useAppStore.getState().updateSettings({ windowWidth: 900 });
    await vi.waitFor(() => expect(callsTo(backend, "save_settings")).toHaveLength(1));
    await vi.waitFor(() => expect(useAppStore.getState().toasts).toHaveLength(1));
    expect(useAppStore.getState().toasts[0]).toMatchObject({
      kind: "error",
      message: strings.settingsSaveFailed,
    });

    // The same folder keeps failing; the debounced writer must not spam.
    backend.failNext("save_settings", "settings.json: Read-only file system (os error 30)");
    useAppStore.getState().updateSettings({ windowWidth: 901 });
    await vi.waitFor(() => expect(callsTo(backend, "save_settings")).toHaveLength(2));
    await Promise.resolve();
    expect(useAppStore.getState().toasts).toHaveLength(1);

    // A write that works again clears the guard, so the next failure is heard.
    useAppStore.getState().updateSettings({ windowWidth: 902 });
    await vi.waitFor(() => expect(callsTo(backend, "save_settings")).toHaveLength(3));
    backend.failNext("save_settings", "settings.json: Read-only file system (os error 30)");
    useAppStore.getState().updateSettings({ windowWidth: 903 });
    await vi.waitFor(() => expect(useAppStore.getState().toasts).toHaveLength(2));
  });
});

describe("librarySlice", () => {
  it("hydrate injects the report and applies the theme", () => {
    const report = emptyReport({
      hosts: [{ id: "h1", name: "db2" } as unknown as Host],
      warnings: ["hosts.json: broken"],
      settings: { ...DEFAULT_SETTINGS, useDarkTheme: false },
    });
    useAppStore.getState().hydrate(report);
    const s = useAppStore.getState();
    // Localhost is injected at the front (Stage 2), so 1 saved host = 2.
    expect(s.hosts).toHaveLength(2);
    expect(s.hosts[0]?.id).toBe(LOCALHOST_ID);
    expect(s.warnings).toEqual(["hosts.json: broken"]);
    expect(s.settings.useDarkTheme).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    useAppStore.getState().hydrate(emptyReport());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("saveHosts updates state and saves once (not debounced)", async () => {
    await useAppStore.getState().saveHosts([{ id: "a", name: "a" } as never, { id: "b", name: "b" } as never]);
    expect(useAppStore.getState().hosts).toHaveLength(2);
    const calls = callsTo(backend, "save_hosts");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args.hosts).toHaveLength(2);
  });

  it("an OS error rolls the list back and raises an error toast (task 3.12)", async () => {
    const a = { id: "a", name: "a" } as never;
    const b = { id: "b", name: "b" } as never;
    await useAppStore.getState().saveHosts([a]);

    backend.failNext("save_hosts", "hosts.json: Read-only file system (os error 30)");
    const inflight = useAppStore.getState().saveHosts([a, b]);
    expect(useAppStore.getState().hosts).toHaveLength(2); // optimistic
    await inflight;
    expect(useAppStore.getState().hosts).toHaveLength(1); // rolled back
    const toast = useAppStore.getState().toasts[0];
    expect(toast?.kind).toBe("error");
    expect(toast?.message).toContain("Read-only file system");
  });

  it("only the latest save may restore its snapshot (save token)", async () => {
    const a = { id: "a", name: "a" } as never;
    const b = { id: "b", name: "b" } as never;
    backend.failNext("save_hosts", "first write fails");
    const first = useAppStore.getState().saveHosts([a]);
    const second = useAppStore.getState().saveHosts([a, b]);
    await Promise.all([first, second]);
    expect(callsTo(backend, "save_hosts")).toHaveLength(2);
    expect(useAppStore.getState().hosts).toHaveLength(2);
  });

  it("saveAccounts / saveBookmarks write their own files", async () => {
    await useAppStore.getState().saveAccounts([{ id: "a1", name: "lab" } as never]);
    await useAppStore.getState().saveBookmarks([{ id: "b1", name: "ls", command: "ls" } as never]);
    expect(callsTo(backend, "save_accounts")[0]?.args.accounts).toHaveLength(1);
    expect(callsTo(backend, "save_bookmarks")[0]?.args.bookmarks).toHaveLength(1);
  });

  it("dismissWarnings clears the banner state", () => {
    useAppStore.getState().hydrate(emptyReport({ warnings: ["w"] }));
    useAppStore.getState().dismissWarnings();
    expect(useAppStore.getState().warnings).toEqual([]);
  });
});
