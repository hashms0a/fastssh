/** Color helpers (task 4.10): legacy EasySSH color strings -> hex. */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function clamp255(n: number): number | null {
  if (!Number.isFinite(n) || n < 0 || n > 255) return null;
  return Math.round(n);
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, "0");
}

/**
 * `rgb(0,43,54)` -> `#002b36`, `#300a24` -> `#300a24`, `#abc` -> `#aabbcc`.
 * Anything else (empty string, garbage, out-of-range) returns null so the
 * caller falls back to the setting.
 */
export function toHex(color: string): string | null {
  const s = color.trim();
  const m = HEX.exec(s);
  if (m) {
    const h = m[1]!;
    return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase() : `#${h.toLowerCase()}`;
  }
  const m2 = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(s);
  if (m2) {
    const r = clamp255(Number(m2[1]));
    const g = clamp255(Number(m2[2]));
    const b = clamp255(Number(m2[3]));
    if (r === null || g === null || b === null) return null;
    return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  }
  return null;
}

/** Relative luminance (WCAG) of a hex color; null for a bad input. */
export function luminance(hex: string): number | null {
  const h = toHex(hex);
  if (!h) return null;
  const parts = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = parts.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** Readable foreground for a terminal background. */
export function contrastForeground(hex: string): string {
  const l = luminance(hex);
  return l !== null && l > 0.5 ? "#171717" : "#f2f2f2";
}
