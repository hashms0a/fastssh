import { mockIPC } from "@tauri-apps/api/mocks";
import { DEFAULT_SETTINGS } from "../types/models";
import type { LoadReport } from "../lib/ipc";

export interface MockBackend {
  calls: Array<{ cmd: string; args: Record<string, unknown> }>;
  report: LoadReport;
  /** Queued rejections per command (save_hosts etc.), consumed in order. */
  failures: Record<string, unknown[]>;
  /**
   * Make the next call to `cmd` reject. A string, or a Rust `AppError` shape
   * (`{ code, message }`) when the test needs the code, e.g. wrong_passphrase.
   */
  failNext: (cmd: string, error: unknown) => void;
  /** Override what a command returns for every later call. */
  answer: (cmd: string, value: unknown) => void;
  answers: Record<string, unknown>;
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
    legacyHosts: 0,
    ...overrides,
  };
}

/** Installs a recording mockIPC with an in-memory LoadReport. */
export function installIpcMock(overrides: Partial<LoadReport> = {}): MockBackend {
  const backend: MockBackend = {
    calls: [],
    report: emptyReport(overrides),
    failures: {},
    answers: {},
    failNext: (cmd, error) => {
      (backend.failures[cmd] ??= []).push(error);
    },
    answer: (cmd, value) => {
      backend.answers[cmd] = value;
    },
  };
  mockIPC((cmd, args) => {
    backend.calls.push({ cmd, args: (args ?? {}) as Record<string, unknown> });
    const queued = backend.failures[cmd];
    const message = queued?.shift();
    if (message !== undefined) return Promise.reject(message);
    if (cmd in backend.answers) return backend.answers[cmd];
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
      // Stage 9: the sync flow asks what it would do, then enables/disables.
      case "ssh_config_info":
        return {
          configPath: "/tmp/fastssh-mock/ssh/config",
          backupPath: "/tmp/fastssh-mock/ssh/config.backup",
          hasConfig: true,
        };
      // Stage 10: the encrypted library and the EasySSH import.
      case "crypto_info":
        return { available: true };
      case "unlock_library":
      case "start_empty_library":
        return backend.report;
      case "import_easyssh":
        return {
          hostsAdded: 5,
          accountsAdded: 1,
          bookmarksAdded: 2,
          skipped: [],
          warnings: [],
        };
      case "enable_ssh_config_sync":
        return {
          backupPath: "/tmp/fastssh-mock/ssh/config.backup",
          imported: [],
          skipped: [],
          hosts: (args as { hosts?: unknown } | undefined)?.hosts ?? [],
        };
      default:
        return null;
    }
  });
  return backend;
}

export const callsTo = (b: MockBackend, cmd: string) => b.calls.filter((c) => c.cmd === cmd);
