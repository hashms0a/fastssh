import { strings } from "../lib/strings";
import { copyText, readClipboard } from "../lib/clipboard";
import { showFileBrowserFor } from "../lib/fileBrowser";
import { logError } from "../lib/log";
import { useAppStore } from "../store/useAppStore";
import { activeTabId, entryOf } from "./activeTab";
import { writeTab } from "./promptActions";

/**
 * The actions behind the shortcut matrix and the terminal context menu
 * (tasks 6.3-6.6). `tabId` is the tab the context menu was opened in; the
 * shortcuts pass nothing and get the active tab of the selected host.
 */

export async function copySelection(tabId?: string): Promise<void> {
  const entry = entryOf(tabId);
  if (!entry) return;
  // R12: an empty selection copies nothing, with no toast.
  await copyText(entry.term.getSelection()).catch((e) => logError("clipboard write failed", e));
}

export async function pasteFromClipboard(tabId?: string): Promise<void> {
  const entry = entryOf(tabId);
  if (!entry) return;
  const text = await readClipboard();
  // Empty clipboard or non-text content: do nothing, no error toast (Stage 6 note).
  if (text) entry.term.paste(text); // term.paste handles bracketed paste
}

export function selectAllTerminal(tabId?: string): void {
  entryOf(tabId)?.term.selectAll();
}

/** Alt+C / the menu item: the output of the last command (R15). */
export function copyLastOutput(tabId?: string): void {
  const entry = entryOf(tabId);
  const text = entry?.last.copyOutput() ?? null;
  const st = useAppStore.getState();
  if (!text) {
    st.pushToast(strings.nothingToCopy);
    return;
  }
  const lines = text.split("\n").length;
  void copyText(text)
    .then(() => st.pushToast(strings.copiedLines(lines)))
    .catch((e) => st.pushToast(String(e), "error"));
}

/** Alt+Up: jump to the start of the last command (R15). */
export function scrollLastCommand(tabId?: string): void {
  const entry = entryOf(tabId);
  if (!entry || !entry.last.scrollToStart()) useAppStore.getState().pushToast(strings.noCommandYet);
}

/** Ctrl+Shift+F and the menu item (task 6.5). */
export function openSearch(tabId?: string): void {
  void tabId; // the toolbar always searches the active tab
  if (!useAppStore.getState().searchOpen) useAppStore.getState().setSearchOpen(true);
}

/** Ctrl+Shift+E / the menu item (R16, task 7.4): the host of `tabId`, or the
 *  selected host when the shortcut fires from the keyboard. */
export function showFileBrowser(tabId?: string): void {
  const st = useAppStore.getState();
  const hostId = tabId ? (st.tabs[tabId]?.hostId ?? "") : (st.selectedHostId ?? "");
  const host = st.hosts.find((h) => h.id === hostId);
  if (!host) {
    st.pushToast(strings.fileBrowserLocalOnly);
    return;
  }
  void showFileBrowserFor(host);
}

/** Bookmarks "Run" (task 7.1, R3): the command reaches the active tab's PTY
 *  with its newline, exactly as if the user had typed it. */
export function runBookmark(command: string): void {
  const st = useAppStore.getState();
  const tabId = activeTabId();
  const sessionId = tabId ? (st.tabs[tabId]?.sessionId ?? null) : null;
  if (!tabId || !sessionId) {
    st.pushToast(strings.openTerminalFirst);
    return;
  }
  writeTab(tabId, sessionId, `${command}\n`);
}
