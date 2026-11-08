/**
 * Task 9.7: turning two-way ~/.ssh/config sync on and off, as a pure function
 * with injected dependencies so the confirm dialog, the toast and the order of
 * operations are unit-proven.
 *
 * Enabling asks first (the file is about to be rewritten), then Rust runs
 * backup -> import -> save -> export; the store re-reads the library from disk
 * and the settings flag is written last, so a failed enable leaves sync off.
 */
import type { Host } from "../types/models";
import { strings } from "./strings";
import { errorText } from "./errorText";
import type { SyncInfo, SyncReport } from "./ipc";

export interface SyncDeps {
  /** The library to sync, Localhost included (Rust filters it out). */
  hosts: Host[];
  info: () => Promise<SyncInfo>;
  confirm: (title: string, message: string) => Promise<boolean>;
  enable: (hosts: Host[]) => Promise<SyncReport>;
  disable: () => Promise<void>;
  /** Re-read the library from disk (load_all + hydrate). */
  reload: () => Promise<void>;
  /** Persist `syncSshConfig` (updateSettings). */
  setSync: (on: boolean) => void;
  toast: (message: string, kind?: "info" | "error") => void;
}

export type SyncOutcome = "enabled" | "cancelled" | "failed";

export async function enableSync(d: SyncDeps): Promise<SyncOutcome> {
  const info = await d.info();
  const ok = await d.confirm(
    strings.syncConfirmTitle,
    strings.syncConfirmMessage(info.configPath, info.backupPath, info.hasConfig),
  );
  if (!ok) return "cancelled";
  try {
    const report = await d.enable(d.hosts);
    await d.reload();
    d.setSync(true);
    d.toast(strings.syncImported(report.imported.length, report.skipped.length));
    return "enabled";
  } catch (e) {
    d.toast(errorText(e), "error");
    return "failed";
  }
}

/** Turning it off only clears the flag; the file keeps the managed section. */
export async function disableSync(d: SyncDeps): Promise<void> {
  try {
    await d.disable();
    d.setSync(false);
    d.toast(strings.syncStopped);
  } catch (e) {
    d.toast(errorText(e), "error");
  }
}
