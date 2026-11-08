/**
 * Prompt heuristics for a remote tab (R11, task 5.4).
 *
 * Pure: it is fed the raw PTY chunks and returns events; it performs no I/O.
 * `sessionController` turns the events into actions, and the unit tests drive
 * it with chunk tables. The ANSI strip drops colour codes and `\r` so the
 * patterns match a real ssh transcript.
 */

export type ErrorKind = "refused" | "unreachable" | "timeout" | "closed" | "auth" | "dns" | "hostkey";

export type WatchEvent =
  | { type: "send-password" }
  | { type: "fingerprint"; text: string }
  | { type: "error"; kind: ErrorKind; line: string }
  | { type: "logged-in" }
  | { type: "logout" }
  /** ssh said "Connection to X closed." after a login: a clean goodbye. */
  | { type: "closed" };

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Za-z0-9]|\r/g;

/** `preLogin` patterns are ignored after a login, so ssh's own goodbye and a
 *  later sudo prompt are not mistaken for a failure. */
const ERRORS: Array<[RegExp, ErrorKind, "preLogin" | "always"]> = [
  [/Connection refused/i, "refused", "preLogin"],
  [/No route to host/i, "unreachable", "preLogin"],
  [/Could not resolve hostname/i, "dns", "preLogin"],
  [/REMOTE HOST IDENTIFICATION HAS CHANGED/i, "hostkey", "preLogin"],
  [/Permission denied, please try again\./i, "auth", "preLogin"],
  [/Permission denied \(/i, "auth", "preLogin"],
  [/Connection timed out|Operation timed out/i, "timeout", "always"],
  [/Broken pipe|Connection reset/i, "closed", "always"],
  [/Connection closed by/i, "closed", "preLogin"],
];

/** A bash/zsh-ish shell prompt at the end of the buffer. */
const PROMPT = /(:~[$#]|\]\$|\]#)\s*$/;
const LOGIN_HINT = /(^|\n)(Last login:|Welcome to )/;
const LOGOUT = /(^|\n)logout\s*$/;
const CLOSED_BY_SSH = /(^|\n)Connection to \S+ closed\.?\s*$/;
const PASSWORD_PROMPT = /password:\s*$/i;
const FINGERPRINT = /\(yes\/no/i;

const TAIL_LIMIT = 2048;

export class PromptWatcher {
  private tail = "";
  passwordSent = false;
  loggedIn = false;

  constructor(private readonly hasPassword: boolean) {}

  feed(chunk: string): WatchEvent[] {
    const out: WatchEvent[] = [];
    this.tail = (this.tail + chunk.replace(ANSI, "")).slice(-TAIL_LIMIT);

    for (const [re, kind, when] of ERRORS) {
      if ((when === "always" || !this.loggedIn) && re.test(this.tail)) {
        const line = this.tail.split("\n").find((l) => re.test(l)) ?? "";
        out.push({ type: "error", kind, line: line.trim() });
        this.tail = "";
        return out; // one event per occurrence
      }
    }

    if (!this.loggedIn && FINGERPRINT.test(this.tail)) {
      out.push({ type: "fingerprint", text: this.tail.split("\n").slice(-3).join("\n") });
      this.tail = "";
      return out;
    }

    // Only before login, so a later `sudo` prompt never gets the password.
    if (!this.loggedIn && !this.passwordSent && this.hasPassword && PASSWORD_PROMPT.test(this.tail)) {
      this.passwordSent = true;
      out.push({ type: "send-password" });
      this.tail = "";
    }

    if (!this.loggedIn && (PROMPT.test(this.tail) || LOGIN_HINT.test(this.tail))) {
      this.loggedIn = true;
      out.push({ type: "logged-in" });
      this.tail = "";
      return out;
    }

    if (this.loggedIn && LOGOUT.test(this.tail)) {
      out.push({ type: "logout" });
      this.tail = "";
    } else if (this.loggedIn && CLOSED_BY_SSH.test(this.tail)) {
      out.push({ type: "closed" });
      this.tail = "";
    }
    return out;
  }
}
