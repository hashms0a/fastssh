import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Terminal } from "@xterm/xterm";
import { ipc } from "../lib/ipc";
import { logError } from "../lib/log";
import { newId } from "../lib/ids";
import { useAppStore } from "../store/useAppStore";
import { LOCALHOST_HOST, LOCALHOST_ID, type Host } from "../types/models";
import { nextTabTitle, tabIdsOf } from "../store/slices/tabsSlice";
import { createTerminal, dispose, type Entry } from "./terminalRegistry";
import { terminalOptions } from "./terminalOptions";

/**
 * Owns the wiring between a tab, its xterm entry and one PTY session
 * (task 4.6). Listeners are registered BEFORE spawn_session so no early
 * output is lost; a tab closed while the spawn is in flight kills the
 * session it just created.
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
function isForegroundTab(tabId: string): boolean {
  const s = useAppStore.getState();
  return s.sidebarMode === "hosts" && (s.activeTabByHost[s.selectedHostId ?? ""] ?? null) === tabId;
}

function wireStdio(tabId: string, entry: Entry): void {
  entry.term.onData((data) => {
    const sid = sessionIdOf(tabId);
    if (sid) ipc.writePty(sid, data).catch((e) => logError("write_pty failed", e));
  });
  entry.term.onResize(({ cols, rows }) => {
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

/** Local tabs close on exit (task 4.12); Stage 5 branches on loggedIn. */
function onExit(tabId: string, code: number): void {
  useAppStore.getState().setTabExited(tabId, code);
  closeTab(tabId);
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

  const entry = createTerminal(tabId, terminalOptions(host, st.settings));
  const writer = createWriter(entry.term);
  wireStdio(tabId, entry);

  const unlistenOutput: UnlistenFn = await listen<string>(`pty-output-${sessionId}`, (ev) => {
    writer.push(ev.payload);
    if (!isForegroundTab(tabId)) useAppStore.getState().setTabUnread(tabId, true);
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
    await ipc.spawnSession(sessionId, host, false, entry.term.cols, entry.term.rows);
  } catch (err) {
    stop(tabId);
    useAppStore.getState().removeTab(tabId);
    dispose(tabId);
    useAppStore.getState().pushToast(String(err), "error");
    return;
  }

  // Closed while the spawn was in flight: kill the session we just made.
  if (!useAppStore.getState().tabs[tabId]) {
    ipc.killSession(sessionId).catch((e) => logError("kill_session failed", e));
    dispose(tabId);
  }
}

export function closeTab(tabId: string): void {
  const st = useAppStore.getState();
  const tab = st.tabs[tabId];
  if (!tab) return;
  stop(tabId);
  st.removeTab(tabId);
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
