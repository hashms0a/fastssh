import { describe, expect, it } from "vitest";
import { isAppShortcut, needsSearchOpen, shortcutFor, type KeyLike, type ShortcutAction } from "./shortcuts";

/**
 * Every row of the spec section 9 matrix. `code` is the physical key, which is
 * what the matcher reads (task 6.2): with Shift held `e.key` is "T", and other
 * layouts report different characters for the same key.
 */
interface Row {
  label?: string;
  code: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action?: ShortcutAction;
}

const ROWS: Row[] = [
  { label: "Ctrl+Q", code: "KeyQ", ctrl: true, action: "quit" },
  { label: "Ctrl+Shift+T", code: "KeyT", ctrl: true, shift: true, action: "new-tab" },
  { label: "Ctrl+Shift+W", code: "KeyW", ctrl: true, shift: true, action: "close-tab" },
  { label: "Ctrl+Shift+Left", code: "ArrowLeft", ctrl: true, shift: true, action: "prev-tab" },
  { label: "Ctrl+Shift+Right", code: "ArrowRight", ctrl: true, shift: true, action: "next-tab" },
  { label: "Ctrl+Shift+C", code: "KeyC", ctrl: true, shift: true, action: "copy" },
  { label: "Ctrl+Shift+V", code: "KeyV", ctrl: true, shift: true, action: "paste" },
  { label: "Ctrl+Shift+A", code: "KeyA", ctrl: true, shift: true, action: "select-all" },
  { label: "Ctrl+Shift+F", code: "KeyF", ctrl: true, shift: true, action: "search" },
  { label: "Ctrl+G", code: "KeyG", ctrl: true, action: "search-next" },
  { label: "Ctrl+Shift+G", code: "KeyG", ctrl: true, shift: true, action: "search-prev" },
  { label: "Ctrl+Shift+E", code: "KeyE", ctrl: true, shift: true, action: "file-browser" },
  { label: "Alt+C", code: "KeyC", alt: true, action: "copy-last-output" },
  { label: "Alt+Up", code: "ArrowUp", alt: true, action: "scroll-last-command" },
  { label: "F11", code: "F11", action: "fullscreen" },
];

const key = (row: Row, over: Partial<KeyLike> = {}): KeyLike => ({
  code: row.code,
  // The Shift variants of the letters arrive as "T"/"t"; the matcher must not care.
  ctrlKey: row.ctrl ?? false,
  shiftKey: row.shift ?? false,
  altKey: row.alt ?? false,
  metaKey: false,
  repeat: false,
  ...over,
});

describe("shortcutFor: the spec section 9 matrix", () => {
  it.each(ROWS)("$label maps to its action", (row) => {
    expect(shortcutFor(key(row))).toBe(row.action);
  });

  it("ignores auto-repeat for every row (no burst of tabs, no repeated toggle)", () => {
    for (const row of ROWS) expect(shortcutFor(key(row, { repeat: true }))).toBeNull();
  });

  it("ignores the meta key and foreign modifier mixes", () => {
    const t = ROWS[1]!;
    expect(shortcutFor(key(t, { metaKey: true }))).toBeNull();
    expect(shortcutFor(key(t, { shiftKey: false }))).toBeNull(); // Ctrl+T is the browser/desktop's
    expect(shortcutFor(key(t, { ctrlKey: false, shiftKey: false, altKey: true }))).toBeNull();
    expect(shortcutFor(key({ code: "KeyC", ctrl: true, shift: true, alt: true, action: "copy" }))).toBeNull();
    expect(shortcutFor(key({ code: "F11", ctrl: true, action: "fullscreen" }))).toBeNull();
    expect(shortcutFor(key({ code: "KeyX", ctrl: true, shift: true, action: "copy" }))).toBeNull();
  });

  it("marks Ctrl+G / Ctrl+Shift+G as search-only keys", () => {
    expect(needsSearchOpen(shortcutFor(key(ROWS[9]!))!)).toBe(true);
    expect(needsSearchOpen(shortcutFor(key(ROWS[10]!))!)).toBe(true);
    expect(needsSearchOpen("search")).toBe(false);
    expect(needsSearchOpen("copy")).toBe(false);
  });
});

/** The predicate handed to term.attachCustomKeyEventHandler (task 6.1). */
const asEvent = (row: Row, over: Partial<KeyLike> = {}): KeyboardEvent => key(row, over) as unknown as KeyboardEvent;

describe("isAppShortcut (the xterm filter)", () => {
  it("claims every row of the matrix, so xterm never sends it to the shell", () => {
    for (const row of ROWS) expect(isAppShortcut(asEvent(row))).toBe(true);
  });

  it("leaves ordinary terminal input to xterm", () => {
    expect(isAppShortcut(asEvent({ code: "KeyC" }))).toBe(false); // plain c
    expect(isAppShortcut(asEvent({ code: "Space" }))).toBe(false);
    expect(isAppShortcut(asEvent({ code: "Enter" }))).toBe(false);
    expect(isAppShortcut(asEvent({ code: "ArrowUp" }))).toBe(false); // history, no Alt
    expect(isAppShortcut(asEvent({ code: "KeyC", ctrl: true }))).toBe(false); // Ctrl+C interrupts
    expect(isAppShortcut(asEvent({ code: "KeyC", shift: true }))).toBe(false);
    expect(isAppShortcut(asEvent({ code: "Tab" }))).toBe(false);
  });

  it("gives Ctrl+G back to xterm while the search toolbar is closed", () => {
    const g = { code: "KeyG", ctrl: true };
    expect(isAppShortcut(asEvent(g), true)).toBe(true);
    expect(isAppShortcut(asEvent(g), false)).toBe(false);
    // Ctrl+Shift+G is the same rule: nothing to step through while closed.
    expect(isAppShortcut(asEvent({ code: "KeyG", ctrl: true, shift: true }), false)).toBe(false);
    expect(isAppShortcut(asEvent({ code: "KeyG", ctrl: true, shift: true }), true)).toBe(true);
  });
});
