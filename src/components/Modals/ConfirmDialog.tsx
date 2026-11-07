import { useEffect, useRef } from "react";
import { useAppStore } from "../../store/useAppStore";
import { buttonClass, primaryButtonClass } from "../Editors/fields";
import type { ConfirmRequest } from "../../store/slices/modalSlice";

/**
 * The dialog for a queued ConfirmRequest (task 3.10). Focus moves in on
 * open, Tab is trapped inside, Escape means Cancel, and focus returns to
 * the opener when it closes.
 */
export function ConfirmDialog({ request }: { request: ConfirmRequest }) {
  const settleModal = useAppStore((s) => s.settleModal);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => opener?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      settleModal(false);
      return;
    }
    if (e.key !== "Tab") return;
    const items = [...(box.current?.querySelectorAll<HTMLElement>("button, [href], input, select, textarea") ?? [])];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      data-testid="confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
      ref={box}
      onKeyDown={onKeyDown}
      className="flex w-96 max-w-full flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-alt)] p-4 shadow-xl"
    >
      <h2 data-testid="confirm-title" className="text-lg font-semibold">
        {request.title}
      </h2>
      <p data-testid="confirm-message" className="text-sm text-[var(--muted)]">
        {request.message}
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" data-testid="confirm-cancel" className={buttonClass} onClick={() => settleModal(false)}>
          {request.cancelLabel}
        </button>
        <button
          type="button"
          data-testid="confirm-ok"
          data-autofocus
          className={primaryButtonClass}
          onClick={() => settleModal(true)}
        >
          {request.confirmLabel}
        </button>
      </div>
    </div>
  );
}
