import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Terminal } from "@xterm/xterm";
import { errorText } from "../lib/errorText";
import { ipc } from "../lib/ipc";
import { logError } from "../lib/log";
import { newId } from "../lib/ids";
import { resolveCredentials } from "../lib/hostUtils";
import { useAppStore } from "../store/useAppStore";
import { LOCALHOST_HOST, LOCALHOST_ID, type Account, type Host } from "../types/models";
import { nextTabTitle, tabIdsOf } from "../store/slices/tabsSlice";
import { createTerminal, dispose, getEntry, type Entry } from "./terminalRegistry";
import { terminalOptions } from "./terminalOptions";
import { ringBell } from "./bell";
import { beginRemote, feedRemote, forgetRemote, isRemoteTab, remoteExit, writeTab } from "./promptActions";
import { forgetWrites } from "./writeLog";

/**
 * Owns the wiring between a tab, its xterm entry and one PTY session
 * (task 4.6, Stage 5). Listeners are registered BEFORE spawn_session so no
 * early output is lost; a tab closed while the spawn is in flight kills the
 * session it just created. Retry (task 5.7) keeps the tabId and swaps the
 * sessionId, which is why every listener is looked up per session.
 */

type Closer = () => void;
const live = new Map<string, Closer>();

function sessionIdOf(tabId: string): string | null {
  return useAppStore.getState().tabs[tabId]?.sessionId ?? null;
}

/**
 * Coalesces PTY chunks into one term.write per frame. `cat` of the 68 MB
 * fixture streams thousands of 16 KiB events; writing each one separately
 * starves the render loop.
 */
function createWriter(term: Terminal) {
  let pending = "";
  let frame = 0;
  const flush = () => {
    frame = 0;
    if (pending) {
      term.write(pending);
      pending = "";
    }
  };
  return {
    push(text: string) {
      pending += text;
      if (frame === 0) frame = requestAnimationFrame(flush);
    },
    flushNow() {
      if (frame !== 0) cancelAnimationFrame(frame);
      flush();
    },
  };
}

/** The tab the user is looking at right now (R13 unread logic). */
function windowFocused(): boolean {
  return useAppStore.getState().windowFocused;
}

function wireStdio(tabId: string, entry: Entry): void {
  entry.term.onData((data) => {
    const sid = sessionIdOf(tabId);
    if (sid) writeTab(tabId, sid, data);
  });
  entry.term.onResize(({ cols, rows }) => {
    // Justified log-only (plan 12.1): a resize of a session that already
    // exited is a no-op, and there is no user action left to report on.
    const sid = sessionIdOf(tabId);
    if (sid) ipc.resizePty(sid, cols, rows).catch((e) => logError("resize_pty failed", e));
  });
}

function stop(tabId: string): void {
  const closer = live.get(tabId);
  if (closer) {
    closer();
    live.delete(tabId);
  }
}

/** Local tabs close on exit (task 4.12); remote ones follow task 5.5. */
function onExit(tabId: string, code: number): void {
  useAppStore.getState().setTabExited(tabId, code);
  if (!isRemoteTab(tabId)) {
    closeTab(tabId);
    return;
  }
  const entry = getEntry(tabId);
  if (remoteExit(tabId, code, (text) => entry?.term.write(text))) closeTab(tabId);
}

/** Account credentials win over the host's own (task 5.2, R2). */
function withCredentials(host: Host, accounts: readonly Account[]): Host {
  const c = resolveCredentials(host, accounts);
  return { ...host, username: c.username, password: c.password, identity_file: c.identity_file };
}

/** Wire one session to an existing tab and spawn it (open and Retry share this). */
async function startSession(tabId: string, host: Host, sessionId: string): Promise<void> {
  const st = useAppStore.getState();
  const entry = getEntry(tabId);
  if (!entry) return;
  const remote = host.local !== true;
  const spawnHost = remote ? withCredentials(host, st.accounts) : host;
  if (remote) beginRemote(tabId, spawnHost.password);
  const writer = createWriter(entry.term);
  wireStdio(tabId, entry);

  const unlistenOutput: UnlistenFn = await listen<string>(`pty-output-${sessionId}`, (ev) => {
    writer.push(ev.payload);
    // R13: at most one store write per unread episode, never for the visible tab.
    useAppStore.getState().markOutput(tabId, windowFocused());
    feedRemote(tabId, ev.payload);
  });
  const unlistenExit: UnlistenFn = await listen<number>(`pty-exit-${sessionId}`, (ev) => {
    // The exit event can beat the last output chunk; let the reader flush.
    setTimeout(() => {
      writer.flushNow();
      stop(tabId);
      onExit(tabId, ev.payload);
    }, 50);
  });
  live.set(tabId, () => {
    unlistenOutput();
    unlistenExit();
  });

  try {
    await ipc.spawnSession(sessionId, spawnHost, st.settings.syncSshConfig, entry.term.cols, entry.term.rows);
  } catch (err) {
    stop(tabId);
    forgetRemote(tabId);
    useAppStore.getState().removeTab(tabId);
    dispose(tabId);
    useAppStore.getState().pushToast(errorText(err), "error");
    return;
  }

  // Closed while the spawn was in flight: kill the session we just made.
  if (!useAppStore.getState().tabs[tabId]) {
    ipc.killSession(sessionId).catch((e) => logError("kill_session failed", e));
    dispose(tabId);
  }
}

export async function connectHost(host: Host): Promise<void> {
  const st = useAppStore.getState();
  const tabId = newId();
  const sessionId = newId();
  const title = nextTabTitle(host.name, tabIdsOf(st, host.id).length);

  st.setSidebarMode("hosts");
  st.selectHost(host.id);
  st.addTab({
    id: tabId,
    hostId: host.id,
    sessionId,
    title,
    unread: false,
    loggedIn: false,
    exited: false,
    exitCode: null,
  });
  createTerminal(tabId, terminalOptions(host, st.settings), host.id, {
    // R12: the audible bell follows settings.audibleBell, read at ring time.
    onBell: () => ringBell(() => useAppStore.getState().settings.audibleBell),
  });
  await startSession(tabId, host, sessionId);
}

/** Retry (task 5.7): same tab, new session, cleared buffer and flags. */
export async function retryTab(tabId: string): Promise<void> {
  const st = useAppStore.getState();
  const tab = st.tabs[tabId];
  if (!tab) return;
  const host = st.hosts.find((h) => h.id === tab.hostId);
  if (!host) {
    closeTab(tabId);
    return;
  }
  stop(tabId);
  ipc.killSession(tab.sessionId).catch((e) => logError("kill_session failed", e));
  forgetRemote(tabId);
  getEntry(tabId)?.term.reset();
  st.resetTabFlags(tabId);
  const sessionId = newId();
  st.setTabSession(tabId, sessionId);
  await startSession(tabId, host, sessionId);
}

/**
 * Closing a tab, retrying it, or a spawn that finished after the tab was
 * already gone. `kill_session` on a session that exited by itself answers
 * "no session", which is the wanted end state - so these three failures are
 * logged, not toasted (plan 12.1). `RunEvent::Exit` still kills everything.
 */
export function closeTab(tabId: string): void {
  const st = useAppStore.getState();
  const tab = st.tabs[tabId];
  if (!tab) return;
  stop(tabId);
  st.removeTab(tabId);
  st.dropDialogsForTab(tabId);
  forgetRemote(tabId);
  forgetWrites(tabId);
  ipc.killSession(tab.sessionId).catch((e) => logError("kill_session failed", e));
  dispose(tabId);
}

/** Every tab of a host, used when the host is removed from the library. */
export function closeHostTabs(hostId: string): void {
  for (const id of tabIdsOf(useAppStore.getState(), hostId)) closeTab(id);
}

/** Header "Local Shell": select Localhost, and open a tab only if it has none. */
export function openLocalShell(): void {
  const st = useAppStore.getState();
  st.setSidebarMode("hosts");
  st.selectHost(LOCALHOST_ID);
  if (tabIdsOf(st, LOCALHOST_ID).length === 0) void connectHost(LOCALHOST_HOST);
}

/** Ctrl+Shift+T / the "+" button: a new tab for the selected host. */
export function newTabForSelectedHost(): void {
  const st = useAppStore.getState();
  const host = st.hosts.find((h) => h.id === st.selectedHostId) ?? st.hosts.find((h) => h.id === LOCALHOST_ID);
  if (host) void connectHost(host);
}

/** Ctrl+Shift+W / the tab's X: close the active tab of the selected host. */
export function closeActiveTabOfSelectedHost(): void {
  const st = useAppStore.getState();
  const hostId = st.selectedHostId;
  if (!hostId) return;
  const active = st.activeTabByHost[hostId] ?? null;
  if (active) closeTab(active);
}

/** Only for tests: forget the listeners without touching the store. */
export function closeAllLive(): void {
  for (const id of [...live.keys()]) stop(id);
}
