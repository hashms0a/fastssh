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
  saveHosts: (hosts: Host[]) => invoke<void>("save_hosts", { hosts }),
  saveAccounts: (accounts: Account[]) => invoke<void>("save_accounts", { accounts }),
  saveBookmarks: (bookmarks: Bookmark[]) => invoke<void>("save_bookmarks", { bookmarks }),
  saveSettings: (settings: AppSettings) => invoke<void>("save_settings", { settings }),
};
