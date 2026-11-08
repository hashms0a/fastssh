import type { StateCreator } from "zustand";
import type { AppStore } from "../useAppStore";
import { LOCALHOST_ID, type Account, type Host } from "../../types/models";

export type SidebarMode = "hosts" | "accounts";
export type EditorMode = "add" | "edit";

/** Which editor the overlay shows. `seed` is the starting draft: the
 *  existing record in edit mode, a fresh (or duplicated) one in add mode. */
export type EditorRequest =
  { kind: "host"; mode: EditorMode; seed: Host } | { kind: "account"; mode: EditorMode; seed: Account };

/**
 * Which passphrase modal is open (task 10.4). `unlock` is driven by
 * `librarySlice.locked`, so the store only ever holds `set` and `disable`;
 * the mode type covers all three because `GpgPasswordModal` takes it.
 */
export type PassModalMode = "unlock" | "set" | "disable";

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "error";
  /** Set for "… Copy this address: <url>" toasts: the Copy button's payload (R16). */
  copy?: string;
}

/** Search toolbar state (task 6.5, R14); `stopped` is the "No more matches" edge. */
export interface SearchState {
  text: string;
  cyclic: boolean;
  caseInsensitive: boolean;
  /** Active result index from SearchAddon, -1 = none. */
  index: number;
  count: number;
  stopped: boolean;
}

export const SEARCH_DEFAULT: SearchState = {
  text: "",
  cyclic: true,
  caseInsensitive: true,
  index: -1,
  count: 0,
  stopped: false,
};

export interface UiSlice {
  sidebarMode: SidebarMode;
  selectedHostId: string | null;
  selectedAccountId: string | null;
  filter: string;
  toasts: Toast[];
  /** Open editor (EditorOverlay), null = no editor. */
  editor: EditorRequest | null;
  /** Stage 8 modal overlays; the two are mutually exclusive. */
  preferencesOpen: boolean;
  /** Stage 10 passphrase modal (set/disable); unlock comes from `locked`. */
  passModal: PassModalMode | null;
  aboutOpen: boolean;
  searchOpen: boolean;
  search: SearchState;
  /** False when the OS window is not focused (R13 unread rule). */
  windowFocused: boolean;
  setSidebarMode: (mode: SidebarMode) => void;
  selectHost: (id: string | null) => void;
  selectAccount: (id: string | null) => void;
  setFilter: (filter: string) => void;
  openEditor: (req: EditorRequest) => void;
  closeEditor: () => void;
  openPassModal: (mode: PassModalMode) => void;
  closePassModal: () => void;
  openPreferences: () => void;
  closePreferences: () => void;
  openAbout: () => void;
  closeAbout: () => void;
  /** Closing the toolbar drops the query and the counters (Escape, task 6.5). */
  setSearchOpen: (open: boolean) => void;
  patchSearch: (patch: Partial<SearchState>) => void;
  setWindowFocused: (focused: boolean) => void;
  /** Info toasts auto-dismiss after 6 s; error toasts stay until dismissed. */
  pushToast: (message: string, kind?: "info" | "error", copy?: string) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 1;

export const createUiSlice: StateCreator<AppStore, [], [], UiSlice> = (set, get) => ({
  sidebarMode: "hosts",
  // Localhost is pre-selected so the first frame shows its landing card.
  selectedHostId: LOCALHOST_ID,
  selectedAccountId: null,
  filter: "",
  toasts: [],
  editor: null,
  preferencesOpen: false,
  passModal: null,
  aboutOpen: false,
  searchOpen: false,
  search: SEARCH_DEFAULT,
  windowFocused: true,
  setSidebarMode: (mode) => set({ sidebarMode: mode }),
  selectHost: (id) => set({ selectedHostId: id }),
  selectAccount: (id) => set({ selectedAccountId: id }),
  setFilter: (filter) => set({ filter }),
  openEditor: (req) => set({ editor: req }),
  closeEditor: () => set({ editor: null }),
  openPassModal: (mode) => set({ passModal: mode }),
  closePassModal: () => set({ passModal: null }),
  openPreferences: () => set({ preferencesOpen: true, aboutOpen: false }),
  closePreferences: () => set({ preferencesOpen: false }),
  openAbout: () => set({ aboutOpen: true, preferencesOpen: false }),
  closeAbout: () => set({ aboutOpen: false }),
  setSearchOpen: (open) => set(open ? { searchOpen: true } : { searchOpen: false, search: SEARCH_DEFAULT }),
  patchSearch: (patch) => set({ search: { ...get().search, ...patch } }),
  setWindowFocused: (focused) => set({ windowFocused: focused }),
  pushToast: (message, kind = "info", copy) => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts, { id, message, kind, copy }] });
    if (kind === "info") {
      setTimeout(() => get().dismissToast(id), 6000);
    }
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
});
