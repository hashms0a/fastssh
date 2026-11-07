import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type Host } from "../../types/models";
import { useAppStore } from "../useAppStore";
import { callsTo, installIpcMock, emptyReport, type MockBackend } from "../../test/ipcMock";

let backend: MockBackend;

beforeEach(() => {
  backend = installIpcMock();
  useAppStore.setState({
    settings: DEFAULT_SETTINGS,
    hosts: [],
    accounts: [],
    bookmarks: [],
    warnings: [],
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
    expect(s.hosts).toHaveLength(1);
    expect(s.warnings).toEqual(["hosts.json: broken"]);
    expect(s.settings.useDarkTheme).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    useAppStore.getState().hydrate(emptyReport());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("setHosts updates state and saves once (not debounced)", async () => {
    await useAppStore.getState().setHosts([{ id: "a", name: "a" } as never, { id: "b", name: "b" } as never]);
    expect(useAppStore.getState().hosts).toHaveLength(2);
    const calls = callsTo(backend, "save_hosts");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args.hosts).toHaveLength(2);
  });

  it("dismissWarnings clears the banner state", () => {
    useAppStore.getState().hydrate(emptyReport({ warnings: ["w"] }));
    useAppStore.getState().dismissWarnings();
    expect(useAppStore.getState().warnings).toEqual([]);
  });
});
