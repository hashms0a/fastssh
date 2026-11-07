/** "Monospace 11" / "Ubuntu Mono 13" (EasySSH font strings) -> xterm options. */

export interface FontSpec {
  family: string;
  size: number;
}

const SUFFIX = /^(.+?)\s+(\d{1,2})$/;
const MIN_SIZE = 6;
const MAX_SIZE = 72;

/** null for empty, size-less, or out-of-range input, so the caller falls back. */
export function parseFontSpec(spec: string): FontSpec | null {
  const s = spec.trim();
  if (!s) return null;
  const m = SUFFIX.exec(s);
  if (!m) return null;
  const family = m[1]!.trim();
  const size = Number(m[2]);
  if (!family || size < MIN_SIZE || size > MAX_SIZE) return null;
  return { family, size };
}
