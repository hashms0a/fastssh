import { useAppStore } from "../store/useAppStore";
import { readClipboard } from "../lib/clipboard";
import { getEntry, getText, markerLine, viewportY } from "../terminal/terminalRegistry";
import { writeCount } from "../terminal/writeLog";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Read-only test hook for the e2e specs (plan Stage 4 notes). Installed only
 * in DEV or Vite mode "e2e" (tools/build-debug.sh); a release build never
 * has it, and Stage 12 greps dist/ for it. Getters only: it cannot change
 * state.
 */
export interface FastSSHTestHook {
  getText(tabId: string): string;
  activeTabId(): string | null;
  cols(tabId: string): number;
  bufferLength(tabId: string): number;
  tabIds(): string[];
  /** How many writes to this tab equal text (Stage 5 password check). */
  writeCount(tabId: string, text: string): number;
  /** Scroll position and the Alt+Up marker (task 6.6/6.10). */
  viewportY(tabId: string): number;
  markerLine(tabId: string): number;
  /** True when this tab's dot is lit (R13). */
  unread(tabId: string): boolean;
  /** Whether the window is fullscreen (F11, R17). */
  isFullscreen(): Promise<boolean>;
  /** Clipboard text, for the Alt+C / Ctrl+Shift+C assertions. */
  readClipboard(): Promise<string>;
}

export const testHook: FastSSHTestHook = {
  getText: (tabId) => getText(tabId),
  activeTabId: () => {
    const s = useAppStore.getState();
    return s.activeTabByHost[s.selectedHostId ?? ""] ?? null;
  },
  cols: (tabId) => getEntry(tabId)?.term.cols ?? 0,
  bufferLength: (tabId) => getEntry(tabId)?.term.buffer.active?.length ?? 0,
  tabIds: () => {
    const s = useAppStore.getState();
    return s.selectedHostId ? (s.tabOrder[s.selectedHostId] ?? []) : [];
  },
  writeCount: (tabId, text) => writeCount(tabId, text),
  viewportY: (tabId) => viewportY(tabId),
  markerLine: (tabId) => markerLine(tabId),
  unread: (tabId) => useAppStore.getState().tabs[tabId]?.unread === true,
  isFullscreen: () => getCurrentWindow().isFullscreen(),
  readClipboard: () => readClipboard(),
};

export function installTestHook(): void {
  if (!import.meta.env.DEV && import.meta.env.MODE !== "e2e") return;
  window.__fastsshTest = testHook;
}

declare global {
  interface Window {
    __fastsshTest?: FastSSHTestHook;
  }
}
