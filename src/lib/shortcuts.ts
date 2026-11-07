/** Global shortcuts (task 4.11). The matrix grows in Stage 6 (R17). */

export type ShortcutAction = "new-tab" | "close-tab";

/** The part of a KeyboardEvent the matcher needs (unit-testable without DOM). */
export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

/**
 * Auto-repeat must not spawn a burst of tabs (R17): `repeat` is checked
 * before anything else.
 */
export function shortcutFor(e: KeyLike): ShortcutAction | null {
  if (e.repeat || !e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return null;
  switch (e.key.toLowerCase()) {
    case "t":
      return "new-tab";
    case "w":
      return "close-tab";
    default:
      return null;
  }
}
