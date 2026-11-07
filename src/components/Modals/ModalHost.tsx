import { useAppStore } from "../../store/useAppStore";
import { ConfirmDialog } from "./ConfirmDialog";

/** Renders the head of the modal queue over the whole window (task 3.10). */
export function ModalHost() {
  const modals = useAppStore((s) => s.modals);
  const head = modals[0];
  if (!head) return null;
  return (
    <div data-testid="modal-host" className="absolute inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <ConfirmDialog request={head} />
    </div>
  );
}
