import { invoke } from "@tauri-apps/api/core";
import type { Account, AppSettings, Bookmark, Host } from "../types/models";

export interface RuntimeInfo {
  version: string;
  desktop: string;
  session: string;
  appimage: boolean;
  dmabufDisabled: boolean;
}

/** Raw shape as serialized by Rust (snake_case). */
interface RawRuntimeInfo {
  version: string;
  desktop: string;
  session: string;
  appimage: boolean;
  dmabuf_disabled: boolean;
}

/** Result of load_all (Rust storage::LoadReport, camelCase). */
export interface LoadReport {
  hosts: Host[];
  accounts: Account[];
  bookmarks: Bookmark[];
  settings: AppSettings;
  warnings: string[];
  locked: boolean;
  legacyAvailable: boolean;
}

/** Task 8.3: read that folder's library, or write the current one into it. */
export type FolderMode = "load" | "copy";

/** Task 9.7: what enabling sync would do (Rust ssh_config_sync::SyncInfo). */
export interface SyncInfo {
  configPath: string;
  backupPath: string;
  hasConfig: boolean;
}

/** The result of enabling sync; `hosts` is the library including the imports. */
export interface SyncReport {
  backupPath: string | null;
  imported: Host[];
  skipped: string[];
  hosts: Host[];
}

/** Typed wrappers over Tauri commands, one per command. */
export const ipc = {
  getRuntimeInfo: async (): Promise<RuntimeInfo> => {
    const r = await invoke<RawRuntimeInfo>("get_runtime_info");
    return {
      version: r.version,
      desktop: r.desktop,
      session: r.session,
      appimage: r.appimage,
      dmabufDisabled: r.dmabuf_disabled,
    };
  },

  loadAll: (): Promise<LoadReport> => invoke<LoadReport>("load_all"),
  quit: () => invoke<void>("quit_app"),
  /** Task 9.6: with sync on, a failed ~/.ssh/config export comes back as a
   *  warning string (the hosts save itself succeeded); null means "no warning". */
  saveHosts: (hosts: Host[]) => invoke<string | null>("save_hosts", { hosts }),
  saveAccounts: (accounts: Account[]) => invoke<void>("save_accounts", { accounts }),
  saveBookmarks: (bookmarks: Bookmark[]) => invoke<void>("save_bookmarks", { bookmarks }),
  saveSettings: (settings: AppSettings) => invoke<void>("save_settings", { settings }),

  // Stage 8 (task 8.3): moving the library to another folder.
  folderHasLibrary: (path: string) => invoke<boolean>("folder_has_library", { path }),
  setHostsFolder: (path: string, mode: FolderMode) => invoke<LoadReport>("set_hosts_folder", { path, mode }),

  // Sessions (Stage 4). Rust accepts only host.local === true for now.
  spawnSession: (sessionId: string, host: Host, syncSshConfig: boolean, cols: number, rows: number) =>
    invoke<void>("spawn_session", { sessionId, host, syncSshConfig, cols, rows }),
  writePty: (sessionId: string, data: string) => invoke<void>("write_pty", { sessionId, data }),
  resizePty: (sessionId: string, cols: number, rows: number) => invoke<void>("resize_pty", { sessionId, cols, rows }),
  killSession: (sessionId: string) => invoke<void>("kill_session", { sessionId }),

  // Stage 9 (task 9.6/9.7): two-way ~/.ssh/config sync.
  sshConfigInfo: (): Promise<SyncInfo> => invoke<SyncInfo>("ssh_config_info"),
  enableSshConfigSync: (hosts: Host[]) => invoke<SyncReport>("enable_ssh_config_sync", { hosts }),
  disableSshConfigSync: () => invoke<void>("disable_ssh_config_sync"),

  // Stage 7: openers (R16, R12). Both resolve with the launcher that accepted
  // the URL, and reject with an AppError whose message contains the URL.
  openSftpFileBrowser: (username: string, host: string, port: number) =>
    invoke<string>("open_sftp_file_browser", { username, host, port }),
  openUrl: (url: string) => invoke<string>("open_url", { url }),
};
