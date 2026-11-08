/**
 * Store glue for the header menu's library-file entries (Stage 11): the backup
 * actions and "Lock library". The behaviour lives in the pure modules
 * (`backup.ts`, `cryptoActions.ts`); this only hands them the store and IPC.
 */
import { save } from "@tauri-apps/plugin-dialog";
import { ipc, type ExportReport } from "./ipc";
import { logError } from "./log";
import { backupLibrary } from "./backup";
import { lockLibrary } from "./cryptoActions";
import { useAppStore } from "../store/useAppStore";

const deps = () => ({ run: ipc.exportLibrary, toast: useAppStore.getState().pushToast, log: logError });

/** "Back up library": one copy in `<hostsFolder>/backups/`. */
export function backupNow(): Promise<ExportReport | null> {
  return backupLibrary(deps(), null);
}

/** "Export library…": the native save dialog picks the file. Cancel does nothing. */
export async function backupToPickedFile(): Promise<ExportReport | null> {
  const picked = await save({
    defaultPath: "fastssh-library.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  const path = typeof picked === "string" ? picked.trim() : "";
  if (!path) return null;
  return backupLibrary(deps(), path);
}

/** "Lock library": Rust drops the passphrase, the unlock modal comes back. */
export function lockLibraryNow(): Promise<boolean> {
  return lockLibrary({
    lock: ipc.lockLibrary,
    setLocked: (locked) => useAppStore.getState().setLocked(locked),
    log: logError,
  });
}
