import { describe, expect, it } from "vitest";
import { PromptWatcher, type WatchEvent } from "./promptWatcher";

const kinds = (evs: WatchEvent[]) => evs.map((e) => e.type);

describe("promptWatcher", () => {
  it("sends the password once, before login", () => {
    const w = new PromptWatcher(true);
    expect(kinds(w.feed("tester@127.0.0.1's password: "))).toEqual(["send-password"]);
    expect(w.passwordSent).toBe(true);
    // A second prompt must not trigger a second injection.
    expect(kinds(w.feed("tester@127.0.0.1's password: "))).toEqual([]);
  });

  it("never sends a password when the host has none", () => {
    const w = new PromptWatcher(false);
    expect(kinds(w.feed("password: "))).toEqual([]);
  });

  it("detects a password prompt split across two chunks", () => {
    const w = new PromptWatcher(true);
    expect(kinds(w.feed("tester@127.0.0.1's passwor"))).toEqual([]);
    expect(kinds(w.feed("d: "))).toEqual(["send-password"]);
  });

  it("detects a login from a coloured prompt and an ANSI-wrapped transcript", () => {
    const w = new PromptWatcher(false);
    expect(kinds(w.feed("\x1b[1;32mtester@5f8a1c\x1b[0m:\x1b[1;34m~\x1b[0m$ \x1b[?2004h"))).toEqual(["logged-in"]);
    expect(w.loggedIn).toBe(true);
    const w2 = new PromptWatcher(false);
    expect(kinds(w2.feed("\r\nLast login: Fri Nov 7 20:00:00 2026\r\n"))).toEqual(["logged-in"]);
  });

  it("does not answer a sudo prompt after login", () => {
    const w = new PromptWatcher(true);
    expect(kinds(w.feed("password: "))).toEqual(["send-password"]);
    expect(kinds(w.feed("tester@host:~$ "))).toEqual(["logged-in"]);
    expect(kinds(w.feed("[sudo] password for tester: "))).toEqual([]);
    expect(w.passwordSent).toBe(true);
  });

  it("reports every error kind", () => {
    const cases: Array<[string, string]> = [
      ["ssh: connect to host 127.0.0.1 port 2299: Connection refused", "refused"],
      ["ssh: connect to host 10.0.0.1 port 22: No route to host", "unreachable"],
      ["ssh: Could not resolve hostname nope: Name or service not known", "dns"],
      ["@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\nREMOTE HOST IDENTIFICATION HAS CHANGED!", "hostkey"],
      ["Permission denied, please try again.", "auth"],
      ["Permission denied (publickey,password).", "auth"],
      ["ssh: connect to host 192.0.2.10 port 22: Connection timed out", "timeout"],
      ["Connection closed by 127.0.0.1 port 2222", "closed"],
      ["Write failed: Broken pipe", "closed"],
      ["Connection reset by peer", "closed"],
    ];
    for (const [line, kind] of cases) {
      const w = new PromptWatcher(true);
      const evs = w.feed(line);
      expect(evs, line).toHaveLength(1);
      const first = evs[0];
      if (first?.type !== "error") throw new Error(`expected an error for ${line}`);
      expect(first.kind, line).toBe(kind);
      expect(first.line).toContain(line.split("\n").pop() ?? line);
    }
  });

  it("ignores ssh's own goodbye after a login, and reports a timeout anyway", () => {
    const w = new PromptWatcher(false);
    expect(kinds(w.feed("tester@host:~$ "))).toEqual(["logged-in"]);
    expect(kinds(w.feed("Connection closed by 127.0.0.1 port 2222\r\n"))).toEqual([]);
    const timeoutEvents = w.feed("Connection timed out during banner exchange\r\n");
    expect(kinds(timeoutEvents)).toEqual(["error"]);
    if (timeoutEvents[0]?.type === "error") expect(timeoutEvents[0].kind).toBe("timeout");
  });

  it("marks logout and ssh's clean close so pty-exit can close the tab", () => {
    const w = new PromptWatcher(false);
    expect(kinds(w.feed("tester@host:~$ "))).toEqual(["logged-in"]);
    expect(kinds(w.feed("logout\r\n"))).toEqual(["logout"]);
    const w2 = new PromptWatcher(false);
    expect(kinds(w2.feed("tester@host:~$ "))).toEqual(["logged-in"]);
    expect(kinds(w2.feed("Connection to 127.0.0.1 closed.\r\n"))).toEqual(["closed"]);
  });

  it("reports the fingerprint question with the last lines of text", () => {
    const w = new PromptWatcher(true);
    const evs = w.feed(
      "The authenticity of host '127.0.0.1 (127.0.0.1)' can't be established.\n" +
        "ED25519 SHA256:AAAA is not known by any other names.\n" +
        "Are you sure you want to continue connecting (yes/no/[fingerprint])?",
    );
    expect(evs).toHaveLength(1);
    expect(evs[0]?.type).toBe("fingerprint");
    if (evs[0]?.type === "fingerprint") {
      expect(evs[0].text).toContain("ED25519 SHA256:AAAA");
      expect(evs[0].text.split("\n")).toHaveLength(3);
    }
    // The password prompt that follows is still answered.
    expect(kinds(w.feed("\ntester@127.0.0.1's password: "))).toEqual(["send-password"]);
  });

  it("keeps only the last 2 KiB of output so a long stream cannot grow the tail", () => {
    const w = new PromptWatcher(true);
    expect(kinds(w.feed("x".repeat(5000)))).toEqual([]);
    expect(kinds(w.feed(" password: "))).toEqual(["send-password"]);
  });
});
