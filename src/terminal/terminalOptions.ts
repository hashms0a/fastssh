import type { AppSettings, Host } from "../types/models";
import { contrastForeground, toHex } from "../lib/colors";
import { parseFontSpec } from "../lib/fontSpec";

/** -1 in settings means "keep a lot" (R12). */
export const UNLIMITED_SCROLLBACK = 50000;
const FALLBACK_BG = "#1e1e1e";

/** The look one tab draws from: the host's own color/font win over the
 *  settings (R12), and `undefined` means "no host" = settings only. */
export interface Appearance {
  fontFamily: string;
  fontSize: number;
  scrollback: number;
  theme: { background: string; foreground: string; cursor: string };
}

export function appearanceFor(host: Host | undefined, settings: AppSettings): Appearance {
  const font = host ? parseFontSpec(host.font) : null;
  const background = toHex(host?.color ?? "") ?? toHex(settings.terminalBackgroundColor) ?? FALLBACK_BG;
  const foreground = contrastForeground(background);
  return {
    fontFamily: font?.family ?? settings.terminalFont,
    fontSize: font?.size ?? settings.terminalFontSize,
    scrollback: settings.scrollbackLines < 0 ? UNLIMITED_SCROLLBACK : settings.scrollbackLines,
    theme: { background, foreground, cursor: foreground },
  };
}

/** Terminal options from the host, falling back to the settings (task 4.10, R12). */
export function terminalOptions(host: Host, settings: AppSettings) {
  return {
    // SearchAddon needs the proposed buffer API (Stage 6 uses it).
    allowProposedApi: true,
    cursorBlink: true,
    ...appearanceFor(host, settings),
  };
}
