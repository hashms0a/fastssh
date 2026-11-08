import type { StateCreator } from "zustand";
import type { AppStore } from "../useAppStore";
import type { ErrorKind } from "../../terminal/promptWatcher";

/**
 * Tab-owned dialogs (Stage 5 tasks 5.6/5.7): the fingerprint question and the
 * connection error. They are queued, so several failing tabs show one dialog
 * at a time, and `ModalHost` renders the head after the confirm queue.
 */
export type DialogInput =
  | { kind: "fingerprint"; tabId: string; text: string }
  | { kind: "connection-error"; tabId: string; errorKind: ErrorKind; line: string };

export type DialogRequest = DialogInput & { id: number };

export interface DialogSlice {
  dialogs: DialogRequest[];
  /** Adds a dialog; a second one of the same kind for the same tab is ignored. */
  enqueueDialog: (input: DialogInput) => void;
  /** Removes one dialog (the user answered it). */
  dismissDialog: (id: number) => void;
  /** A closed tab can never be answered, so its dialogs are dropped (5.6). */
  dropDialogsForTab: (tabId: string) => void;
}

/** Pure selector: does this tab already have a dialog queued? */
export const hasDialogForTab = (s: { dialogs: DialogRequest[] }, tabId: string): boolean =>
  s.dialogs.some((d) => d.tabId === tabId);

let dialogSeq = 1;

export const createDialogSlice: StateCreator<AppStore, [], [], DialogSlice> = (set, get) => ({
  dialogs: [],

  enqueueDialog: (input) => {
    const s = get();
    if (s.dialogs.some((d) => d.kind === input.kind && d.tabId === input.tabId)) return;
    set({ dialogs: [...s.dialogs, { ...input, id: dialogSeq++ }] });
  },

  dismissDialog: (id) => set({ dialogs: get().dialogs.filter((d) => d.id !== id) }),

  dropDialogsForTab: (tabId) => {
    const s = get();
    if (!hasDialogForTab(s, tabId)) return;
    set({ dialogs: s.dialogs.filter((d) => d.tabId !== tabId) });
  },
});
