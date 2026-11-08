import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal, type ITerminalOptions } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { isAppShortcut } from "../lib/shortcuts";
import { useAppStore } from "../store/useAppStore";
import { LastCommandTracker } from "./lastCommand";
import { openExternalUrl } from "./openLink";

/**
 * xterm instances live outside React (task 4.5). Each tab owns a host <div>
 * that is moved between containers, so a host switch, a StrictMode double
 * effect or a re-render never disposes a buffer: scrollback survives.
 */
export interface Entry {
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  /** Alt+C / Alt+Up markers for this tab (task 6.6). */
  last: LastCommandTracker;
  host: HTMLDivElement;
  opened: boolean;
}

export interface TerminalHooks {
  /** Fired on term.onBell; decides whether to ring (settings.audibleBell). */
  onBell?: () => void;
}

const entries = new Map<string, Entry>();

/** Idempotent: calling it twice for the same tab returns the existing entry. */
export function createTerminal(tabId: string, opts: ITerminalOptions, hooks: TerminalHooks = {}): Entry {
  const existing = entries.get(tabId);
  if (existing) return existing;
  const term = new Terminal({ allowProposedApi: true, ...opts });
  const fit = new FitAddon();
  const search = new SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(search);
  // R12 clickable links; the opener command arrives with Stage 7.
  term.loadAddon(new WebLinksAddon((_event, uri) => openExternalUrl(uri)));
  // Task 6.1: xterm must ignore the app's chords, or Alt+C reaches the shell
  // as ESC c and Ctrl+Shift+C as ^C. The handler returns true for keys xterm
  // should handle, so everything else is negated here. Ctrl+G stays with the
  // shell while the search toolbar is closed.
  term.attachCustomKeyEventHandler((e) => !isAppShortcut(e, useAppStore.getState().searchOpen));
  if (hooks.onBell) term.onBell(hooks.onBell);
  const host = document.createElement("div");
  host.className = "h-full w-full";
  const entry: Entry = { term, fit, search, last: new LastCommandTracker(term), host, opened: false };
  entries.set(tabId, entry);
  return entry;
}

/** Move the tab's host div into `container`, opening the terminal on first use. */
export function attach(tabId: string, container: HTMLElement): void {
  const e = entries.get(tabId);
  if (!e) return;
  if (e.host.parentElement !== container) container.appendChild(e.host);
  if (!e.opened) {
    e.term.open(e.host);
    e.opened = true;
  }
}

/**
 * Pure guard for safeFit: a hidden pane measures 0, and fitting it would send
 * cols=0 to the PTY. Exported so the rule is unit-testable.
 */
export function shouldFit(opened: boolean, width: number, height: number): boolean {
  return opened && width > 0 && height > 0;
}

export function safeFit(tabId: string): void {
  const e = entries.get(tabId);
  if (!e || !shouldFit(e.opened, e.host.clientWidth, e.host.clientHeight)) return;
  e.fit.fit();
}

export function focusTerminal(tabId: string): void {
  entries.get(tabId)?.term.focus();
}

export function dispose(tabId: string): void {
  const e = entries.get(tabId);
  if (!e) return;
  entries.delete(tabId);
  e.last.dispose();
  e.term.dispose(); // also disposes the loaded addons
  e.host.remove();
}

/** Test hook: plain text of the active buffer (see src/lib/testHook.ts). */
export function getText(tabId: string): string {
  const b = entries.get(tabId)?.term.buffer.active;
  if (!b) return "";
  const out: string[] = [];
  for (let i = 0; i < b.length; i++) out.push(b.getLine(i)?.translateToString(true) ?? "");
  return out.join("\n").trimEnd();
}

export const getEntry = (tabId: string): Entry | undefined => entries.get(tabId);

/** Test hook (task 6.6/6.10): scroll position and the Alt+Up marker line. */
export const viewportY = (tabId: string): number => entries.get(tabId)?.term.buffer.active?.viewportY ?? -1;
export const markerLine = (tabId: string): number => entries.get(tabId)?.last.line ?? -1;

/** Only for tests: forget every entry without touching a live session. */
export function disposeAll(): void {
  for (const id of [...entries.keys()]) dispose(id);
}
