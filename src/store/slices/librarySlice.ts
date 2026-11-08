import type { StateCreator } from "zustand";
import type { Account, Bookmark, Host } from "../../types/models";
import { LOCALHOST_HOST } from "../../types/models";
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
  /** Optimistic write: state changes at once, an OS error rolls it back (3.12). */
  /** Resolves true when the write reached the disk (task 3.12). */
  saveHosts: (hosts: Host[]) => Promise<boolean>;
  saveAccounts: (accounts: Account[]) => Promise<boolean>;
  saveBookmarks: (bookmarks: Bookmark[]) => Promise<boolean>;
  dismissWarnings: () => void;
}

/**
 * Save token per collection (plan 3.12): two saves in flight must not have
 * the older failure restore its snapshot over the newer state.
 */
function makeSaver<K extends "hosts" | "accounts" | "bookmarks">(
  key: K,
  save: (v: AppStore[K], get: () => AppStore) => Promise<void>,
) {
  let token = 0;
  return (set: (p: Partial<AppStore>) => void, get: () => AppStore, next: AppStore[K]) => {
    const previous = get()[key];
    const my = ++token;
    set({ [key]: next } as unknown as Partial<AppStore>);
    return save(next, get)
      .then(() => true)
      .catch((e) => {
        if (my === token) set({ [key]: previous } as unknown as Partial<AppStore>);
        logError(`save_${key} failed`, e);
        get().pushToast(String(e), "error");
        return false;
      });
  };
}

/** Library saves are NOT debounced (plan Stage 1 notes): each explicit
 *  save is one write; settings changes on every resize and use 400 ms. */
export const createLibrarySlice: StateCreator<AppStore, [], [], LibrarySlice> = (set, get) => {
  // Task 9.6: a failed ~/.ssh/config export is a warning, not a failed save.
  const saveHosts = makeSaver("hosts", async (hosts, get) => {
    const warning = await ipc.saveHosts(hosts);
    if (warning) get().pushToast(warning, "error");
  });
  const saveAccounts = makeSaver("accounts", async (accounts) => {
    await ipc.saveAccounts(accounts);
  });
  const saveBookmarks = makeSaver("bookmarks", async (bookmarks) => {
    await ipc.saveBookmarks(bookmarks);
  });
  return {
    hosts: [],
    accounts: [],
    bookmarks: [],
    warnings: [],
    locked: false,
    legacyAvailable: false,
    hydrate: (report) => {
      document.documentElement.classList.toggle("dark", report.settings.useDarkTheme);
      // R8: the in-memory Localhost lives at the front of the library.
      const hosts = [LOCALHOST_HOST, ...report.hosts];
      set({
        hosts,
        accounts: report.accounts,
        bookmarks: report.bookmarks,
        warnings: report.warnings,
        locked: report.locked,
        legacyAvailable: report.legacyAvailable,
        settings: report.settings,
      });
    },
    saveHosts: (hosts) => saveHosts(set, get, hosts),
    saveAccounts: (accounts) => saveAccounts(set, get, accounts),
    saveBookmarks: (bookmarks) => saveBookmarks(set, get, bookmarks),
    dismissWarnings: () => set({ warnings: [] }),
  };
};

/** Toggle a group's collapsed state in settings.collapsedGroups. */
export function toggleGroupCollapsed(s: AppStore, group: string): void {
  const cur = s.settings.collapsedGroups;
  const next = cur.includes(group) ? cur.filter((g) => g !== group) : [...cur, group];
  s.updateSettings({ collapsedGroups: next });
}
