import type { StateCreator } from "zustand";
import type { AppStore } from "../useAppStore";
import { strings } from "../../lib/strings";

/** One queued dialog (task 3.10). Confirm resolves the caller's promise. */
export interface ConfirmRequest {
  id: number;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  resolve: (ok: boolean) => void;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface ModalSlice {
  /** Queue; ModalHost renders only the head. */
  modals: ConfirmRequest[];
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Settles the head of the queue (Confirm/Cancel/Escape). */
  settleModal: (ok: boolean) => void;
}

let modalSeq = 1;

export const createModalSlice: StateCreator<AppStore, [], [], ModalSlice> = (set, get) => ({
  modals: [],
  confirm: (opts) =>
    new Promise<boolean>((resolve) => {
      const req: ConfirmRequest = {
        id: modalSeq++,
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? strings.confirmOk,
        cancelLabel: opts.cancelLabel ?? strings.cancel,
        resolve,
      };
      set({ modals: [...get().modals, req] });
    }),
  settleModal: (ok) => {
    const [head, ...rest] = get().modals;
    if (!head) return;
    head.resolve(ok);
    set({ modals: rest });
  },
});
