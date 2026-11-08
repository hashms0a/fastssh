/**
 * Task 10.7: the one-click EasySSH import. Pure function with injected
 * dependencies (rule 7): Rust does the merge, the UI reloads the library and
 * reports the counts. Warnings go to the log; the first three also go to the
 * toast, so a broken record is visible without flooding the screen.
 */
import type { ImportReport } from "./ipc";
import { errorText } from "./errorText";
import { strings } from "./strings";

export interface ImportDeps {
  importEasyssh: () => Promise<ImportReport>;
  /** Re-read the library from disk (load_all + hydrate). */
  reload: () => Promise<void>;
  toast: (message: string, kind?: "info" | "error") => void;
  log: (message: string, error: unknown) => void;
}

export type ImportOutcome = "imported" | "failed";

/** Guards a double click: two imports in flight would merge the same file twice. */
let running = false;

export async function runEasysshImport(d: ImportDeps): Promise<ImportOutcome> {
  if (running) return "failed";
  running = true;
  try {
    const report = await d.importEasyssh();
    await d.reload();
    d.toast(
      strings.importedFromEasyssh(
        report.hostsAdded,
        report.accountsAdded,
        report.bookmarksAdded,
        report.skipped.length,
      ),
    );
    for (const w of report.warnings) d.log("easyssh import", w);
    if (report.warnings.length > 0) d.toast(strings.importWarnings(report.warnings.slice(0, 3)), "error");
    return "imported";
  } catch (e) {
    d.log("import_easyssh failed", e);
    d.toast(errorText(e), "error");
    return "failed";
  } finally {
    running = false;
  }
}
