import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * Focus behaviour shared by the Stage 5 dialogs: focus moves to the
 * `data-autofocus` control on open, Tab stays inside, and the opener gets
 * focus back when the dialog closes. `ConfirmDialog` (Stage 3) keeps its own
 * version because its Escape means Cancel.
 */
export function useDialogFocus<T extends HTMLElement>() {
  const box = useRef<T>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => opener?.focus?.();
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent) => {
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

  return { box, onKeyDown };
}
