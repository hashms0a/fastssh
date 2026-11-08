import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  run: () => void;
  disabled?: boolean;
  /** Tooltip for not-yet-wired actions (plan Stage 2: show, don't hide). */
  title?: string;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  testId?: string;
}

/**
 * Generic positioned menu (sidebar rows, header menu). Closes on Escape,
 * outside click, window blur and scroll. Clamped so it never renders
 * off-screen at the right/bottom edge.
 */
export function ContextMenu({ x, y, items, onClose, testId = "context-menu" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(0, Math.min(x, window.innerWidth - rect.width));
    const top = Math.max(0, Math.min(y, window.innerHeight - rect.height));
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const close = () => onClose();
    // Capture phase: when the terminal has focus, xterm consumes Escape and
    // stops propagation, so a bubble-phase listener would never see it.
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("blur", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-testid={testId}
      role="menu"
      className="fixed z-50 min-w-40 rounded-md border border-[var(--border)] bg-[var(--bg-alt)] py-1 shadow-lg"
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          data-testid={`${testId}-item`}
          title={item.title}
          disabled={item.disabled}
          className="block w-full px-3 py-1 text-left text-sm hover:bg-[var(--accent)] hover:text-white disabled:opacity-50"
          onClick={() => {
            onClose();
            item.run();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
