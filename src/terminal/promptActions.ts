/**
 * What a remote tab does with the events the prompt watcher produced
 * (R11, tasks 5.4 and 5.5). This module owns the per-tab watcher so
 * `sessionController` stays about wiring, and the actions are the four the
 * plan lists: send the password, ask for the fingerprint, report the error,
 * remember the login/logout.
 */
import { ipc } from "../lib/ipc";
import { logError } from "../lib/log";
import { strings } from "../lib/strings";
import { hasDialogForTab } from "../store/slices/dialogSlice";
import { useAppStore } from "../store/useAppStore";
import { PromptWatcher, type WatchEvent } from "./promptWatcher";
import { recordWrite } from "./writeLog";

interface RemoteState {
  watcher: PromptWatcher;
  password: string;
  /** ssh said "logout" or "Connection to X closed." (a clean goodbye). */
  closedCleanly: boolean;
}

const remotes = new Map<string, RemoteState>();

/** Called for every remote session, including after Retry. */
export function beginRemote(tabId: string, password: string): void {
  remotes.set(tabId, {
    watcher: new PromptWatcher(password.length > 0),
    password,
    closedCleanly: false,
  });
}

export function forgetRemote(tabId: string): void {
  remotes.delete(tabId);
}

export const isRemoteTab = (tabId: string): boolean => remotes.has(tabId);

/** One write path for everything the app sends, so the e2e count is honest. */
export function writeTab(tabId: string, sessionId: string, data: string): void {
  recordWrite(tabId, data);
  ipc.writePty(sessionId, data).catch((e) => logError("write_pty failed", e));
}

export function feedRemote(tabId: string, chunk: string): void {
  const remote = remotes.get(tabId);
  if (!remote) return;
  applyEvents(tabId, remote, remote.watcher.feed(chunk));
}

function applyEvents(tabId: string, remote: RemoteState, events: readonly WatchEvent[]): void {
  const st = useAppStore.getState();
  const tab = st.tabs[tabId];
  if (!tab) return; // the tab is gone; its dialogs were dropped
  for (const ev of events) {
    switch (ev.type) {
      case "send-password":
        writeTab(tabId, tab.sessionId, `${remote.password}\n`);
        break;
      case "fingerprint":
        st.enqueueDialog({ kind: "fingerprint", tabId, text: ev.text });
        break;
      case "error":
        st.enqueueDialog({ kind: "connection-error", tabId, errorKind: ev.kind, line: ev.line });
        break;
      case "logged-in":
        st.setTabLoggedIn(tabId);
        break;
      case "logout":
      case "closed":
        remote.closedCleanly = true;
        break;
    }
  }
}

/**
 * pty-exit of a remote tab (task 5.5). Returns true when the tab may close:
 * a login followed by "logout"/"Connection to X closed." and code 0 or 255.
 * Otherwise the tab stays with its output visible, gets a dim exit line, and
 * - when nothing is queued for it already - a generic error dialog.
 */
export function remoteExit(tabId: string, code: number, writeDim: (text: string) => void): boolean {
  const st = useAppStore.getState();
  const remote = remotes.get(tabId);
  const tab = st.tabs[tabId];
  if (!remote || !tab) return true;
  if (remote.watcher.loggedIn && remote.closedCleanly && (code === 0 || code === 255)) return true;
  writeDim(`\x1b[2m${strings.processExited(code)}\x1b[0m\r\n`);
  if (!hasDialogForTab(st, tabId)) {
    st.enqueueDialog({ kind: "connection-error", tabId, errorKind: "closed", line: "" });
  }
  return false;
}

/** Only for tests: forget every remote state. */
export function clearRemotes(): void {
  remotes.clear();
}
