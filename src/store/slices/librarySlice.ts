import type { StateCreator } from "zustand";
import type { Account, Bookmark, Host } from "../../types/models";
import type { LoadReport } from "../../lib/ipc";
import { ipc } from "../../lib/ipc";
import { logError } from "../../lib/log";
import type { AppStore } from "../useAppStore";

export interface LibrarySlice {
  hosts: Host[];
  accounts: Account[];
  bookmarks: Bookmark[];
  warnings: string[];
  /** True when a *.json.gpg file needs the passphrase (Stage 10). */
  locked: boolean;
  legacyAvailable: boolean;
  /** Injects the load_all report before the first render (main.tsx). */
  hydrate: (report: LoadReport) => void;
  setHosts: (hosts: Host[]) => void;
  setAccounts: (accounts: Account[]) => void;
  setBookmarks: (bookmarks: Bookmark[]) => void;
  dismissWarnings: () => void;
}

/** Library saves are NOT debounced (plan Stage 1 notes): each explicit
 *  save is one write; settings changes on every resize and use 400 ms. */
export const createLibrarySlice: StateCreator<AppStore, [], [], LibrarySlice> = (set) => ({
  hosts: [],
  accounts: [],
  bookmarks: [],
  warnings: [],
  locked: false,
  legacyAvailable: false,
  hydrate: (report) => {
    document.documentElement.classList.toggle("dark", report.settings.useDarkTheme);
    set({
      hosts: report.hosts,
      accounts: report.accounts,
      bookmarks: report.bookmarks,
      warnings: report.warnings,
      locked: report.locked,
      legacyAvailable: report.legacyAvailable,
      settings: report.settings,
    });
  },
  setHosts: (hosts) => {
    set({ hosts });
    ipc.saveHosts(hosts).catch((e) => logError("save_hosts failed", e));
  },
  setAccounts: (accounts) => {
    set({ accounts });
    ipc.saveAccounts(accounts).catch((e) => logError("save_accounts failed", e));
  },
  setBookmarks: (bookmarks) => {
    set({ bookmarks });
    ipc.saveBookmarks(bookmarks).catch((e) => logError("save_bookmarks failed", e));
  },
  dismissWarnings: () => set({ warnings: [] }),
});
