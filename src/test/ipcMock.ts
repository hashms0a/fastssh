import { mockIPC } from "@tauri-apps/api/mocks";
import { DEFAULT_SETTINGS } from "../types/models";
import type { LoadReport } from "../lib/ipc";

export interface MockBackend {
  calls: Array<{ cmd: string; args: Record<string, unknown> }>;
  report: LoadReport;
}

export function emptyReport(overrides: Partial<LoadReport> = {}): LoadReport {
  return {
    hosts: [],
    accounts: [],
    bookmarks: [],
    settings: DEFAULT_SETTINGS,
    warnings: [],
    locked: false,
    legacyAvailable: false,
    ...overrides,
  };
}

/** Installs a recording mockIPC with an in-memory LoadReport. */
export function installIpcMock(overrides: Partial<LoadReport> = {}): MockBackend {
  const backend: MockBackend = { calls: [], report: emptyReport(overrides) };
  mockIPC((cmd, args) => {
    backend.calls.push({ cmd, args: (args ?? {}) as Record<string, unknown> });
    switch (cmd) {
      case "get_runtime_info":
        return {
          version: "1.0.0",
          desktop: "GNOME",
          session: "wayland",
          appimage: false,
          dmabuf_disabled: true,
        };
      case "load_all":
        return backend.report;
      default:
        return null;
    }
  });
  return backend;
}

export const callsTo = (b: MockBackend, cmd: string) => b.calls.filter((c) => c.cmd === cmd);
