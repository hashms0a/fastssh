/**
 * Stage 11 (P2): back the library up into one JSON file, as a pure function
 * with injected dependencies (rule 7), so the toast text, the double-click
 * guard and the failure path are unit-proven without a running app. Rust does
 * the file work (src-tauri/src/export.rs); this only reports it.
 */
import type { ExportReport } from "./ipc";
import { errorText } from "./errorText";
import { strings } from "./strings";

export interface BackupDeps {
  /** `export_library`; a null path means the automatic backups folder. */
  run: (path: string | null) => Promise<ExportReport>;
  toast: (message: string, kind?: "info" | "error") => void;
  log: (message: string, error: unknown) => void;
}

/** Guards a double click: two exports in flight would race on one folder. */
let running = false;
export function resetBackupGuard(): void {
  running = false;
}

/**
 * One backup copy. Resolves with the report, or null when a backup was already
 * running or Rust failed - and the failure is toasted with the OS message,
 * which names the file (rule: a caught error is shown, never swallowed).
 */
export async function backupLibrary(d: BackupDeps, path: string | null): Promise<ExportReport | null> {
  if (running) return null;
  running = true;
  try {
    const report = await d.run(path);
    d.toast(strings.backupSaved(report.hosts, report.accounts, report.bookmarks, report.path, report.encrypted));
    return report;
  } catch (e) {
    d.log("export_library failed", e);
    d.toast(errorText(e), "error");
    return null;
  } finally {
    running = false;
  }
}
