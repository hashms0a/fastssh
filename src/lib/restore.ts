//! Session restore (task 8.5, R19): turn settings.openedHosts into tabs.
//! The plan is pure and clamped, so a corrupt value cannot open 500 tabs.

import type { Host, OpenedHostState } from "../types/models";

export const MAX_RESTORE_TABS_PER_HOST = 10;
export const RESTORE_STAGGER_MS = 150;

export interface RestoreEntry {
  host: Host;
  tabCount: number;
}

export interface RestoreRunner {
  open: (host: Host) => void | Promise<void>;
  /** Called once, on the first restored host, so its notebook is in front. */
  select: (host: Host) => void;
  /** Test seam: the stagger is a timer in the app and a no-op in a test. */
  sleep?: (ms: number) => Promise<void>;
  /** True once the app is quitting: stop instead of spawning more sessions. */
  stopped?: () => boolean;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Entries whose host still exists, in the order they were saved. A name that
 * is gone is skipped (the user deleted the connection), and a tabCount above
 * MAX_RESTORE_TABS_PER_HOST is clamped down.
 */
export function restorePlan(openedHosts: readonly OpenedHostState[], hosts: readonly Host[]): RestoreEntry[] {
  const out: RestoreEntry[] = [];
  for (const entry of openedHosts) {
    const name = entry.hostName?.trim();
    if (!name) continue;
    const host = hosts.find((h) => h.name === name && h.local !== true);
    if (!host) continue;
    if (!Number.isFinite(entry.tabCount) || entry.tabCount < 1) continue;
    out.push({ host, tabCount: Math.min(entry.tabCount, MAX_RESTORE_TABS_PER_HOST) });
  }
  return out;
}

/** Staggered so 20 ssh handshakes do not start in the same millisecond. */
export async function runRestore(plan: readonly RestoreEntry[], runner: RestoreRunner): Promise<void> {
  const sleep = runner.sleep ?? wait;
  for (const [index, entry] of plan.entries()) {
    if (runner.stopped?.() === true) return;
    if (index === 0) runner.select(entry.host);
    for (let n = 0; n < entry.tabCount; n++) {
      if (runner.stopped?.() === true) return;
      await runner.open(entry.host);
      await sleep(RESTORE_STAGGER_MS);
    }
  }
  // Opening a tab also selects its host, so the last connect would otherwise
  // leave the last host in front: task 8.5 wants the first one visible.
  const first = plan[0];
  if (first && plan.length > 1) runner.select(first.host);
}
