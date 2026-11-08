//! Pure preference-value rules (task 8.1): the same bounds the Rust lenient
//! parse uses, so the modal cannot offer a value settings.json rejects.

import { strings } from "./strings";
import { UNLIMITED_SCROLLBACK } from "../terminal/terminalOptions";

export const MIN_FONT_SIZE = 6;
export const MAX_FONT_SIZE = 48;
export const MIN_SCROLLBACK = 100;
export const MAX_SCROLLBACK = 100000;

/** -1 is "Unlimited"; the field shows what xterm actually keeps (R12). */
export function scrollbackDisplay(lines: number): string {
  return lines < 0 ? strings.unlimitedValue(UNLIMITED_SCROLLBACK) : String(lines);
}

/** "Unlimited", "-1" and the displayed "Unlimited (50000)" all mean -1;
 *  a number is clamped into the settings bounds. */
export function scrollbackFromText(text: string): number | null {
  const raw = text.trim();
  if (raw === "") return null;
  if (raw.toLowerCase().startsWith("unlimited") || raw === "-1") return -1;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(Math.round(n), MIN_SCROLLBACK), MAX_SCROLLBACK);
}

/** Font size 6-48 (spec section 5); null for text that is not a number. */
export function fontSizeFromText(text: string): number | null {
  const raw = text.trim();
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(Math.round(n), MIN_FONT_SIZE), MAX_FONT_SIZE);
}

/** A folder with a library is offered to be loaded; an empty one to be
 *  filled with a copy of the current library (task 8.3). */
export function folderModeFor(hasLibrary: boolean): "load" | "copy" {
  return hasLibrary ? "load" : "copy";
}
