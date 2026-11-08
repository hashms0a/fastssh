//! Task 8.2: a Preferences change reaches the terminals that are already
//! open. One pass over the registry sets the options and re-fits; a host with
//! its own color/font keeps them, because appearanceFor is recomputed per tab.

import type { AppSettings, Host } from "../types/models";
import { appearanceFor } from "./terminalOptions";
import { entryIds, getEntry, safeFit } from "./terminalRegistry";

/** The theme class on <html> (R18); index.css defines the palette under it. */
export function applyTheme(useDarkTheme: boolean): void {
  document.documentElement.classList.toggle("dark", useDarkTheme);
}

export function applyAppearance(settings: AppSettings, hosts: readonly Host[]): void {
  for (const id of entryIds()) {
    const entry = getEntry(id);
    if (!entry) continue;
    const look = appearanceFor(
      hosts.find((h) => h.id === entry.hostId),
      settings,
    );
    // xterm's option proxy fires the change events, so the renderer, the
    // char size and the buffer (scrollback) follow without a rebuild.
    entry.term.options.fontFamily = look.fontFamily;
    entry.term.options.fontSize = look.fontSize;
    entry.term.options.scrollback = look.scrollback;
    entry.term.options.theme = look.theme;
    // A different font size changes the cell width, so the grid must re-fit.
    safeFit(id);
  }
}
