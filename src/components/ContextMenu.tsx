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
 *
 * The menu is mounted inside the row that opened it, and a selected row sets
 * `text-[var(--on-accent)]` (near-black on the light-blue accent) for its own
 * label. Text therefore has to be set here, on the menu itself: inheriting
 * would paint near-black labels on the dark `--bg-alt` panel. Item colours
 * name palette tokens explicitly (`--fg` idle, `--on-accent` on the accent
 * fill, `--muted` when disabled); every pair is asserted in
 * src/themeContrast.test.ts.
 *
 * Task 12.5: opening moves focus to the first enabled item, ArrowUp/Down
 * (plus Home/End) walk the items, and closing puts focus back on the control
 * that opened the menu.
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
    const enabled = () => [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    const move = (delta: number) => {
      const list = enabled();
      if (list.length === 0) return;
      const at = list.indexOf(document.activeElement as HTMLElement);
      list[(at + delta + list.length) % list.length]?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        move(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        move(-1);
      } else if (e.key === "Home") {
        e.preventDefault();
        enabled()[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        enabled()[enabled().length - 1]?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const close = () => onClose();
    const opener = document.activeElement as HTMLElement | null;
    enabled()[0]?.focus();
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
      if (document.contains(opener ?? null)) opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-testid={testId}
      role="menu"
      className="fixed z-50 min-w-40 rounded-md border border-[var(--border)] bg-[var(--bg-alt)] py-1 text-[var(--fg)] shadow-lg"
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
          // `enabled:` keeps a disabled item from taking the hover/focus fill:
          // :hover and :focus still match a disabled button in CSS.
          className="block w-full px-3 py-1 text-left text-sm text-[var(--fg)] enabled:hover:bg-[var(--accent)] enabled:hover:text-[var(--on-accent)] enabled:focus:bg-[var(--accent)] enabled:focus:text-[var(--on-accent)] disabled:text-[var(--muted)]"
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
