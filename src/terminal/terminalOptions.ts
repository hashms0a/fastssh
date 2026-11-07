import type { AppSettings, Host } from "../types/models";
import { contrastForeground, toHex } from "../lib/colors";
import { parseFontSpec } from "../lib/fontSpec";

/** -1 in settings means "keep a lot" (R12). */
export const UNLIMITED_SCROLLBACK = 50000;
const FALLBACK_BG = "#1e1e1e";

/** Terminal options from the host, falling back to the settings (task 4.10, R12). */
export function terminalOptions(host: Host, settings: AppSettings) {
  const font = parseFontSpec(host.font);
  const background = toHex(host.color) ?? toHex(settings.terminalBackgroundColor) ?? FALLBACK_BG;
  const foreground = contrastForeground(background);
  return {
    // SearchAddon needs the proposed buffer API (Stage 6 uses it).
    allowProposedApi: true,
    fontFamily: font?.family ?? settings.terminalFont,
    fontSize: font?.size ?? settings.terminalFontSize,
    scrollback: settings.scrollbackLines < 0 ? UNLIMITED_SCROLLBACK : settings.scrollbackLines,
    cursorBlink: true,
    theme: { background, foreground, cursor: foreground },
  };
}
