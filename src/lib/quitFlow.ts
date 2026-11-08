//! The quit flow (task 8.4, R19): remember what was open, save, then quit.
//! Everything is behind injected deps, so the order is a unit test.

import type { AppSettings, Host, OpenedHostState } from "../types/models";

export interface QuitState {
  settings: AppSettings;
  hosts: Host[];
  tabOrder: Record<string, string[]>;
}

export interface QuitDeps extends QuitState {
  patch: (patch: Partial<AppSettings>) => void;
  flush: () => Promise<void>;
  quit: () => Promise<void>;
  /** A failed save is reported but does not trap the user in the app. */
  onError?: (e: unknown) => void;
}

/**
 * One entry per host that has tabs, in the order the notebooks were opened.
 * Localhost is never listed: EasySSH did not restore local shells either, and
 * a restored local shell would reopen a shell on every start (Stage 8 Notes).
 * With Restore off the list is empty, so the next start opens nothing.
 */
export function openedHostsFor(s: QuitState): OpenedHostState[] {
  const out: OpenedHostState[] = [];
  for (const [hostId, ids] of Object.entries(s.tabOrder)) {
    if (ids.length === 0) continue;
    const host = s.hosts.find((h) => h.id === hostId);
    if (!host || host.local === true) continue;
    out.push({ hostName: host.name, tabCount: ids.length });
  }
  return out;
}

/** Task 8.4: a second Ctrl+Q while the app is quitting does nothing. */
let quitting = false;
export const isQuitting = (): boolean => quitting;
/** Only for tests: forget that a quit started. */
export function resetQuitGuard(): void {
  quitting = false;
}

/** Resolves false when a quit is already running (the guard). */
export async function quitFlow(deps: QuitDeps): Promise<boolean> {
  if (quitting) return false;
  quitting = true;
  deps.patch({ openedHosts: deps.settings.restoreHosts ? openedHostsFor(deps) : [] });
  try {
    await deps.flush();
  } catch (e) {
    deps.onError?.(e);
  }
  await deps.quit();
  return true;
}
