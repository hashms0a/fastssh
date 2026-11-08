/**
 * Task 10.4: the passphrase flows as pure functions with injected
 * dependencies, so the modal's behaviour (wrong passphrase keeps the input,
 * Cancel at unlock asks "Quit FastSSH?", "Start empty" renames the file aside,
 * the Encrypt toggle only flips after Rust succeeded) is unit-proven without a
 * running app. The passphrase is only ever passed to these callbacks; it is
 * never put in the store or logged.
 */
import type { LoadReport } from "./ipc";
import { errorCode, errorText } from "./errorText";
import { strings } from "./strings";
import { checkPassphrase, type PassError } from "./passphrase";

/** Text of a passphrase-rule failure (task 10.4 shows it in the modal). */
export const passErrorText: Record<PassError, string> = {
  required: strings.gpgPassRequired,
  tooShort: strings.gpgPassTooShort,
  mismatch: strings.gpgPassMismatch,
  newline: strings.gpgPassNewline,
};

export interface UnlockDeps {
  unlock: (passphrase: string) => Promise<LoadReport>;
  /** Rename the unreadable encrypted files aside and load what is left. */
  startEmpty: () => Promise<LoadReport>;
  hydrate: (report: LoadReport) => void;
  confirm: (title: string, message: string) => Promise<boolean>;
  quit: () => Promise<void>;
  log: (message: string, error: unknown) => void;
}

export type UnlockOutcome = "unlocked" | "wrong" | "failed" | "emptied" | "cancelled" | "quit";

/** The outcome plus, for a failure, the message to show in the modal. */
export interface UnlockResult {
  outcome: UnlockOutcome;
  message?: string;
}

/** Send a candidate passphrase. A wrong one leaves the modal open and the
 *  input untouched (task 10.4); an unreadable file offers "Start empty". */
export async function unlockLibrary(d: UnlockDeps, passphrase: string): Promise<UnlockResult> {
  if (checkPassphrase(passphrase, { minLength: 1 })) return { outcome: "cancelled" };
  try {
    const report = await d.unlock(passphrase);
    d.hydrate(report);
    return { outcome: "unlocked" };
  } catch (e) {
    if (errorCode(e) === "wrong_passphrase") return { outcome: "wrong", message: strings.gpgWrongPassphrase };
    d.log("unlock_library failed", e);
    return { outcome: "failed", message: errorText(e) };
  }
}

/** Cancel during unlock: without the data the app cannot work, so the plan
 * (task 10.4) asks "Quit FastSSH?" and quits on OK. */
export async function cancelUnlock(d: UnlockDeps): Promise<UnlockResult> {
  const ok = await d.confirm(strings.gpgQuitTitle, strings.gpgQuitMessage);
  if (!ok) return { outcome: "cancelled" };
  try {
    await d.quit();
    return { outcome: "quit" };
  } catch (e) {
    d.log("quit_app failed", e);
    return { outcome: "cancelled" };
  }
}

/**
 * The last resort when an encrypted file cannot be read (the plan's fake
 * `hosts.json.gpg` case): set the files aside - their bytes stay on disk - and
 * start with an empty library. It asks first, because it changes the library.
 */
export async function startEmptyLibrary(d: UnlockDeps): Promise<UnlockResult> {
  const ok = await d.confirm(strings.gpgStartEmptyTitle, strings.gpgStartEmptyMessage);
  if (!ok) return { outcome: "cancelled" };
  try {
    const report = await d.startEmpty();
    d.hydrate(report);
    return { outcome: "emptied" };
  } catch (e) {
    d.log("start_empty_library failed", e);
    return { outcome: "failed", message: errorText(e) };
  }
}

export interface LockDeps {
  lock: () => Promise<void>;
  /** store.setLocked(true) - `App.tsx` then shows the unlock modal again. */
  setLocked: (locked: boolean) => void;
  log: (message: string, error: unknown) => void;
}

/**
 * Stage 11, the answer to Stage 10's open question 1: "Lock library now".
 * Rust forgets the passphrase; the library stays in memory until the next
 * read or save, which then needs the passphrase again. No toast - the unlock
 * modal appearing is the whole report.
 */
export async function lockLibrary(d: LockDeps): Promise<boolean> {
  try {
    await d.lock();
    d.setLocked(true);
    return true;
  } catch (e) {
    d.log("lock_library failed", e);
    return false;
  }
}

export interface EncryptDeps {
  setEncryption: (enabled: boolean, passphrase: string | null) => Promise<void>;
  /** updateSettings({encryptData}) - the frontend owns the settings writer. */
  setFlag: (on: boolean) => void;
  /** Write settings.json now, so a reload sees the flag. */
  flush: () => Promise<void>;
  toast: (message: string, kind?: "info" | "error") => void;
  log: (message: string, error: unknown) => void;
}

export type EncryptOutcome = "on" | "off" | "invalid" | "wrong" | "failed";

export interface EncryptResult {
  outcome: EncryptOutcome;
  message?: string;
}

/** Enable: encrypt all three files (Rust verifies each by decrypting it before
 *  it removes the plain copy), then store the flag. */
export async function enableEncryption(d: EncryptDeps, passphrase: string, confirm: string): Promise<EncryptResult> {
  const bad = checkPassphrase(passphrase, { confirm });
  if (bad) return { outcome: "invalid", message: passErrorText[bad] };
  try {
    await d.setEncryption(true, passphrase);
    d.setFlag(true);
    await d.flush();
    d.toast(strings.libraryEncrypted);
    return { outcome: "on" };
  } catch (e) {
    d.log("set_encryption(enable) failed", e);
    d.toast(errorText(e), "error");
    return {
      outcome: errorCode(e) === "wrong_passphrase" ? "wrong" : "failed",
      message: errorText(e),
    };
  }
}

/** Disable: re-prompt for the current passphrase, write the plain files, then
 *  let Rust remove the `.gpg` files. */
export async function disableEncryption(d: EncryptDeps, passphrase: string): Promise<EncryptResult> {
  const bad = checkPassphrase(passphrase, { minLength: 1 });
  if (bad) return { outcome: "invalid", message: passErrorText[bad] };
  try {
    await d.setEncryption(false, passphrase);
    d.setFlag(false);
    await d.flush();
    d.toast(strings.libraryDecrypted);
    return { outcome: "off" };
  } catch (e) {
    d.log("set_encryption(disable) failed", e);
    d.toast(errorText(e), "error");
    return {
      outcome: errorCode(e) === "wrong_passphrase" ? "wrong" : "failed",
      message: errorText(e),
    };
  }
}
