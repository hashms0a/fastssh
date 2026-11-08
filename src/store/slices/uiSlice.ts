import type { StateCreator } from "zustand";
import type { AppStore } from "../useAppStore";
import { LOCALHOST_ID, type Account, type Host } from "../../types/models";

export type SidebarMode = "hosts" | "accounts";
export type EditorMode = "add" | "edit";

/** Which editor the overlay shows. `seed` is the starting draft: the
 *  existing record in edit mode, a fresh (or duplicated) one in add mode. */
export type EditorRequest =
  { kind: "host"; mode: EditorMode; seed: Host } | { kind: "account"; mode: EditorMode; seed: Account };

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "error";
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
  /** Closing the toolbar drops the query and the counters (Escape, task 6.5). */
  setSearchOpen: (open: boolean) => void;
  patchSearch: (patch: Partial<SearchState>) => void;
  setWindowFocused: (focused: boolean) => void;
  /** Info toasts auto-dismiss after 6 s; error toasts stay until dismissed. */
  pushToast: (message: string, kind?: "info" | "error") => void;
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
  searchOpen: false,
  search: SEARCH_DEFAULT,
  windowFocused: true,
  setSidebarMode: (mode) => set({ sidebarMode: mode }),
  selectHost: (id) => set({ selectedHostId: id }),
  selectAccount: (id) => set({ selectedAccountId: id }),
  setFilter: (filter) => set({ filter }),
  openEditor: (req) => set({ editor: req }),
  closeEditor: () => set({ editor: null }),
  setSearchOpen: (open) => set(open ? { searchOpen: true } : { searchOpen: false, search: SEARCH_DEFAULT }),
  patchSearch: (patch) => set({ search: { ...get().search, ...patch } }),
  setWindowFocused: (focused) => set({ windowFocused: focused }),
  pushToast: (message, kind = "info") => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts, { id, message, kind }] });
    if (kind === "info") {
      setTimeout(() => get().dismissToast(id), 6000);
    }
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
});
