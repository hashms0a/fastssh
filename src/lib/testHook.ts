import { useAppStore } from "../store/useAppStore";
import { getEntry, getText } from "../terminal/terminalRegistry";
import { writeCount } from "../terminal/writeLog";

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
