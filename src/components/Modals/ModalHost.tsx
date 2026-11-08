import type { ReactNode } from "react";
import type { DialogRequest } from "../../store/slices/dialogSlice";
import { useAppStore } from "../../store/useAppStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { ConnectionErrorModal } from "./ConnectionErrorModal";
import { FingerprintModal } from "./FingerprintModal";

function dialogNode(dialog: DialogRequest): ReactNode {
  if (dialog.kind === "fingerprint") return <FingerprintModal request={dialog} />;
  return <ConnectionErrorModal request={dialog} />;
}

/**
 * Renders the head of the queues over the whole window (task 3.10, Stage 5):
 * a confirm request wins, otherwise the first tab dialog. One dialog at a
 * time, so several failing tabs queue their modals instead of stacking.
 */
export function ModalHost() {
  const modals = useAppStore((s) => s.modals);
  const dialogs = useAppStore((s) => s.dialogs);
  const confirm = modals[0];
  const dialog = confirm ? undefined : dialogs[0];
  if (!confirm && !dialog) return null;
  return (
    <div data-testid="modal-host" className="absolute inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
      {confirm ? <ConfirmDialog request={confirm} /> : dialogNode(dialog!)}
    </div>
  );
}
