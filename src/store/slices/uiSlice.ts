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

export interface UiSlice {
  sidebarMode: SidebarMode;
  selectedHostId: string | null;
  selectedAccountId: string | null;
  filter: string;
  toasts: Toast[];
  /** Open editor (EditorOverlay), null = no editor. */
  editor: EditorRequest | null;
  setSidebarMode: (mode: SidebarMode) => void;
  selectHost: (id: string | null) => void;
  selectAccount: (id: string | null) => void;
  setFilter: (filter: string) => void;
  openEditor: (req: EditorRequest) => void;
  closeEditor: () => void;
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
  setSidebarMode: (mode) => set({ sidebarMode: mode }),
  selectHost: (id) => set({ selectedHostId: id }),
  selectAccount: (id) => set({ selectedAccountId: id }),
  setFilter: (filter) => set({ filter }),
  openEditor: (req) => set({ editor: req }),
  closeEditor: () => set({ editor: null }),
  pushToast: (message, kind = "info") => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts, { id, message, kind }] });
    if (kind === "info") {
      setTimeout(() => get().dismissToast(id), 6000);
    }
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
});
