/**
 * Task 10.3/10.4: the passphrase rules the UI checks before it calls Rust.
 * The plan fixes them for enabling: a passphrase plus a confirmation that
 * matches, at least 8 characters, no newline (Rust rejects a newline too,
 * because gpg reads the passphrase as one stdin line). Unlocking only needs a
 * non-empty line - an old passphrase is whatever the user set years ago.
 */

export const MIN_PASSPHRASE_LENGTH = 8;

export type PassError = "required" | "tooShort" | "mismatch" | "newline";

export interface PassRules {
  /** The confirmation field, in "set" mode. */
  confirm?: string;
  /** Enable uses 8; unlock and disable accept any length (default 8). */
  minLength?: number;
}

/** `null` when the passphrase may be sent to Rust. */
export function checkPassphrase(pass: string, rules: PassRules = {}): PassError | null {
  const min = rules.minLength ?? MIN_PASSPHRASE_LENGTH;
  if (!pass) return "required";
  if (pass.includes("\n") || pass.includes("\r")) return "newline";
  if (pass.length < min) return "tooShort";
  if (rules.confirm !== undefined && rules.confirm !== pass) return "mismatch";
  return null;
}
