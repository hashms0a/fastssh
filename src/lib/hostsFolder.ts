//! Task 8.3 flow: the user typed or picked another hosts folder, so ask
//! whether to load that folder's library or copy the current one into it.
//! Cancel (or a failed command) means "revert the field", which the modal
//! does from the returned result.

import type { AppSettings } from "../types/models";
import type { FolderMode, LoadReport } from "./ipc";
import { errorText } from "./errorText";
import { folderModeFor } from "./prefs";
import { strings } from "./strings";

export interface FolderFlowDeps {
  folder: string;
  hasLibrary: (folder: string) => Promise<boolean>;
  confirm: (title: string, message: string) => Promise<boolean>;
  setFolder: (folder: string, mode: FolderMode) => Promise<LoadReport>;
  /** Replaces the in-memory library with the report (store `hydrate`). */
  applyReport: (report: LoadReport) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  toast: (message: string, kind?: "info" | "error") => void;
}

/** Only "loaded" and "copied" mean the field is the truth afterwards. */
export type FolderResult = "loaded" | "copied" | "cancelled" | "failed";

export async function changeHostsFolder(deps: FolderFlowDeps): Promise<FolderResult> {
  const has = await deps.hasLibrary(deps.folder);
  const mode = folderModeFor(has);
  const question = has ? strings.loadLibraryFrom(deps.folder) : strings.copyLibraryTo(deps.folder);
  const note = has ? strings.loadLibraryNote : strings.copyLibraryNote;
  if (!(await deps.confirm(strings.prefsTitle, `${question} ${note}`))) return "cancelled";

  try {
    const report = await deps.setFolder(deps.folder, mode);
    deps.applyReport(report); // open tabs keep their sessions (task 8.3)
    deps.updateSettings({ hostsFolder: report.settings.hostsFolder });
    deps.toast(mode === "load" ? strings.folderLoaded(deps.folder) : strings.folderCopied(deps.folder));
    return mode === "load" ? "loaded" : "copied";
  } catch (e) {
    deps.toast(errorText(e), "error");
    return "failed";
  }
}
