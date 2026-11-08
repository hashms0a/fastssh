/**
 * The global key matrix (spec section 9, R17). Matching is on `e.code`, never
 * on `e.key`: with Shift held `e.key` is "T", and non-US layouts report other
 * characters for the same physical key.
 *
 * `isAppShortcut` is also handed to xterm through
 * `term.attachCustomKeyEventHandler(task 6.1)`: returning false makes xterm
 * ignore the chord, so Alt+C never reaches the shell as `ESC c` and
 * Ctrl+Shift+C never reaches it as `^C`.
 */

export type ShortcutAction =
  | "quit"
  | "new-tab"
  | "close-tab"
  | "prev-tab"
  | "next-tab"
  | "copy"
  | "paste"
  | "select-all"
  | "search"
  | "search-next"
  | "search-prev"
  | "file-browser"
  | "copy-last-output"
  | "scroll-last-command"
  | "fullscreen";

/** The part of a KeyboardEvent the matcher needs (unit-testable without DOM). */
export interface KeyLike {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

const CTRL_SHIFT: Record<string, ShortcutAction> = {
  KeyT: "new-tab",
  KeyW: "close-tab",
  KeyC: "copy",
  KeyV: "paste",
  KeyA: "select-all",
  KeyF: "search",
  KeyG: "search-prev",
  KeyE: "file-browser",
  ArrowLeft: "prev-tab",
  ArrowRight: "next-tab",
};

/**
 * Auto-repeat is ignored for every action (R17): holding a chord must not
 * spawn a burst of tabs, toggle fullscreen repeatedly, or spam the clipboard.
 */
export function shortcutFor(e: KeyLike): ShortcutAction | null {
  if (e.repeat) return null;
  if (e.ctrlKey && !e.altKey && !e.metaKey) {
    if (e.shiftKey) return CTRL_SHIFT[e.code] ?? null;
    if (e.code === "KeyQ") return "quit";
    if (e.code === "KeyG") return "search-next";
    return null;
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    if (e.code === "KeyC") return "copy-last-output";
    if (e.code === "ArrowUp") return "scroll-last-command";
    return null;
  }
  // F11 with no other modifier; Ctrl+F11 etc. belong to the desktop.
  if (e.code === "F11" && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) return "fullscreen";
  return null;
}

/**
 * Keys the window owns; xterm must not consume them (task 6.1). Ctrl+G and
 * Ctrl+Shift+G belong to the app only while the search toolbar is open, so
 * `searchOpen` decides whether xterm keeps them.
 */
export function isAppShortcut(e: KeyboardEvent, searchOpen = true): boolean {
  const action = shortcutFor(e);
  if (!action) return false;
  return !needsSearchOpen(action) || searchOpen;
}

/** Ctrl+G is only meaningful while the search toolbar is open (spec section 9). */
export const needsSearchOpen = (action: ShortcutAction): boolean =>
  action === "search-next" || action === "search-prev";
