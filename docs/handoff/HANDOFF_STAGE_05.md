# HANDOFF_STAGE_05 — Complete. Remote SSH works: ssh-line builder, prompt watcher, fingerprint + connection-error dialogs, Retry; `verify.sh full` passes with all 9 e2e specs.

Status: Stage 5 tasks 5.1–5.8 done. All 13 Stage 5 acceptance bullets are
proved (10 `[e2e]` in `e2e/specs/ssh.e2e.ts`, 2 `[unit]` groups, 1 `[agent]`
screenshot). Gate ran once at the end with the full e2e suite (milestone stage
⇒ `E2E_ALL=1`).

## 1. Test-target environment (unchanged since Stage 0A)

Ubuntu 24.04 / GNOME / Wayland / XWayland, x86_64. Node v26.13.0, npm 11.20.0,
rustc 1.99.1. `XDG_SESSION_TYPE=wayland`, `XDG_CURRENT_DESKTOP=ubuntu:GNOME`.
Container `fastssh-sshd` up on 127.0.0.1:2222 (tester / fastssh-test-pass,
lab-key user). Sandbox `~/fastssh-testenv` (config/, ssh/, legacy/). Nothing
outside the sandbox touched; `~/.ssh` and `~/.config/easyssh` untouched.

Session start state: `HEAD` = `c01cfbf Stage04: PTY manager, local shell and
host notebooks`, no commits after it, `git status --short` clean, no stash.

## 2. What exists now (Stage 5)

**Rust**

- `src-tauri/src/ssh_command.rs` (+ `ssh_command/tests.rs`, 11 tests) —
  `build_ssh_line(host, creds, sync, sandbox_ssh_dir)`. Quoting is shell-safe
  (`shell_quote` covers space, single quote, `$`, backtick, newline, tab, `~`,
  `*`); `parse_tunnel_flags` splits the tunnels string into `-L/-R/-D/-w`
  args; `-i` gets tilde expansion; port/host/name are validated (bad ones
  return a message naming the host, `bad_request` at the command boundary).
  The password is never part of the line: `SpawnSpec::Ssh` runs
  `/bin/sh -c "exec ssh …"` with a generated `SSH_ASKPASS` helper in
  `PTY_SPAWN_ENV` (`password` + `askpass_path` removed from the child env), so
  `ps` shows no password and ssh never echoes it.
- `src-tauri/src/commands/session.rs` — `spec_for` now returns
  `SpawnSpec::Ssh(line)` for remote hosts (5.3). When `FASTSSH_SSH_DIR` is set
  (the sandbox), the line gets `-F <dir>/config -o UserKnownHostsFile=<dir>/
known_hosts`, so no test can touch the owner's `~/.ssh` (R20).
- `src-tauri/src/models.rs` — `Host`'s `Debug` is hand-written and prints
  `password: "<redacted>"` (plan note "Host Debug must redact the password"),
  asserted by `models/tests.rs::host_debug_never_prints_the_password`.
- `src-tauri/src/storage/tests.rs` — new unit test that `atomic_write` into a
  `0500` dir fails with `PermissionDenied` and names the path (Stage 3 bullet
  "No chmod on the sandbox", see §3.2).

**Frontend**

- `src/terminal/promptWatcher.ts` — pure class, fed every `pty-output` chunk
  (`feed(chunk)` → `WatcherOut`). Keeps a 4 KiB tail, never splits a line:
  classifies `password` / `passphrase` / `Keyboard-interactive prompts`,
  `hostkey-change` / `hostkey-verify`, and the error kinds `refused`,
  `unreachable`, `timeout`, `closed`, `auth`, `dns`, `hostkey`. A single
  `s` typed after `Password:` is counted as a real answer, not a match
  (ssh echoes `s` back). `reset()` clears state and drops an unterminated
  partial line.
- `src/terminal/promptActions.ts` — the store side of watcher events: sets
  `loggedIn`, queues dialogs (deduped per tab), writes `logout` vs the
  `[Process exited with code N]` line per task 5.5, and ignores a dialog for a
  tab that is gone.
- `src/store/slices/dialogSlice.ts` (+ `.test.ts`) — the dialog queue that
  `ModalHost` renders after the confirm queue; `dropDialogsForTab` on close.
- `src/components/Modals/FingerprintModal.tsx` — the raw ssh lines (key type,
  fingerprint, prompt) verbatim; `fingerprint-yes` / `fingerprint-no` write
  `yes\n` / `no\n`; closing = `no`, and closing the tab drops the dialog (5.6).
- `src/components/Modals/ConnectionErrorModal.tsx` + `dialogFocus.ts` — the
  friendly text (`strings.errorKind`), the full OS line, the host-key hint
  ("run ssh-keygen -R …"; FastSSH never edits known_hosts), `Retry` for
  refused / unreachable / timeout / auth / dns, and `Close` always;
  `dialogFocus.ts` moves focus to the affirmative control (V9).
- `src/terminal/sessionController.ts` — `resolveCredentials` runs in the
  frontend before `spawn_session` (5.2); `startSession(tabId, host,
sessionId)` is shared by connect and Retry (5.7), listeners are keyed per
  session so a Retry's old session can never write into the terminal
  (`sessionController.test.ts` asserts the old `sessionId` is cleared from the
  map and that no listener is registered for it); remote exit follows 5.5.
- `src/terminal/writeLog.ts` + `testHook.writeCount(tabId, text)` — counts
  writes that equal a string, so the spec can prove the password was never
  written to the terminal (see §3.9).
- `src/lib/strings.ts` — new dialog strings; `ConnectionEditor` shows
  `extraArgsHint` ("Appended verbatim and interpreted by /bin/sh", task 5.3
  note).

**Tests / harness**

- `e2e/specs/ssh.e2e.ts` — 10 tests covering every `[e2e]` bullet: fingerprint
  Yes → prompt in `getText`, second connect shows no modal within 5 s,
  `sudo -k; sudo true` (buffer ends with the prompt, password count 0, and the
  password appears nowhere in the log or the PTY ring), `exit` closes the tab
  and landing-connect reappears, item2 key-auth logs in with no modal,
  Сервер-1 → "Connection refused" within 6 s, my-server → timeout within 10 s,
  `ps -eo args` has `ssh.*18080` while logged in and none after the tab
  closes, wrong-password copy → "Authentication failed" with the password
  never in the buffer, `docker stop fastssh-sshd` → "Connection closed" +
  `[Process exited with code 255]` + the tab stays open, then `logout` closes
  it.
- `e2e/helpers.ts` — `connectRow` (waits for the tab to appear),
  `clickInPage` (a DOM click beats the W3C click on this driver),
  `selectedRowNames`, `writeCount`, `hookTabIds`; `e2e/specs/ssh.e2e.ts` keeps
  a `shellPath` helper local (it needs `TERM=xterm-256color` for the zellij
  test servers).
- `e2e/wdio.conf.ts` — `onPrepare` kills leftovers of the e2e binary,
  `tauri-driver` and `WebKitWebDriver` before a run (a leftover app instance
  races the driven one; a leftover driver keeps port 4444 and the new run talks
  to it); `retries` is now `E2E_RETRIES` (default 1) so debugging can set 0.
- `e2e/tsconfig.json` + `npm run typecheck` now type-check the specs (verify's
  tsc step used to filter `e2e/` out and hid real errors, e.g. `await $$`).
- `tools/verify.sh` — `e2e-all` step and `E2E_ALL=1` on the `full` chain.

## 3. Deviations and spec corrections (read this before trusting a green run)

1. **Fixture password.** `tools/make_fixtures.sh` wrote
   `fastssh-test-pass-todo-remove` for item10; the container's password is
   `fastssh-test-pass`, so every password assertion in the plan's Stage 5
   bullets was impossible. Fixture + `e2e/helpers.ts` `TEST_PASS` now use the
   real value. Re-seed with `tools/make_fixtures.sh` if a sandbox predates this.
2. **`library.e2e.ts` live-chmod test deleted.** It chmod'ed the sandbox config
   dir to `0400` and asserted an OS-error toast. `ensure_config_dir()` chmods
   the dir to `0700` on every save (Stage 1 acceptance, proved by
   `states.e2e.ts`), so the write always succeeds and the toast can never
   appear. Stage 3's bullet says "(No chmod on the sandbox)": the toast and the
   revert are proved by `editors.test.tsx`, and `atomic_write` in a `0500` dir
   is now proved by the new Rust unit test.
3. **`library.e2e.ts` identity/Browse test deleted.** Opening the native file
   dialog is a `[human]` bullet (task 3.5, V10): the dialog is its own window,
   so the driver's Escape/keys never reach it and the following `type()`
   failed. The plan's `[e2e]` bullet for this spec only asks for add / edit
   port / duplicate / remove; the identity field is covered by unit tests.
4. **`library.e2e.ts` remove-selection test rewritten.** It asserted that the
   selected host stayed selected after removal, which contradicts V4 ("after a
   row click / remove wait for that row to disappear from `$$` before the next
   click"). It now waits for the removed row to be gone and asserts the
   selection cleared (`landing-card` absent) with the other rows still listed.
   This test was never run before: with `bail: true`, Stage 3's failing test 7
   stopped the spec, so tests 8–11 were unverified until now.
5. **`library.e2e.ts` host-list expectation fixed.** Duplicate creates
   `web-1-copy` _and_ `web-1-copy-2`; only the first is removed, so the final
   list must contain `web-1-copy-2`.
6. **`library.e2e.ts` row selection goes through the DOM** (`clickInPage` +
   `selectedRowNames`). A W3C click is reported as done before the window acts
   on it and `row-click` fires on pointerdown, so a single tap sometimes did
   not reach the row that had just been re-rendered after a removal.
   `selectRow()` now clicks until the row reports as selected (max 6).
7. **Global mocha timeout 30 s → 120 s.** The plan's own budgets (error modal
   within 10 s, no modal within 5 s plus a full connect) exceeded the old cap.
   Tight assertions still live inside `browser.waitUntil` with the plan's
   numbers, so a real regression fails fast; the 120 s only covers the fixed
   cost of connecting.
8. **`maxInstances` stays 1.** Every instance's window maps to the same XWayland
   window, so parallel instances fight over focus and screenshots; specs run
   sequentially in one run instead.
9. **Password-not-echoed check uses `writeCount`, not the PTY ring.**
   `getText()` carries escape sequences and the container rewrites the prompt
   line, so "the buffer contains no password" is proved by counting writes that
   equal the password (0) plus a log/buffer scan. The `Password:` prompt itself
   is asserted through `expectPrompt()`, which reads the rendered buffer and
   accepts any prefix split (`Password:` / `pass` / `word:`).
10. **`connectRow()` waits for the tab, not for a 200 ms pause.** The "no modal
    within 5 s" and key-auth bullets need a click that definitely registered;
    the helper taps until the tab strip shows a new tab, then the 5 s window
    starts.
11. **The `sudo -k; sudo true` bullet uses a stand-in.** The test container
    (Ubuntu 24.04.5) has no `sudo`, so the spec reproduces ssh's prompt line
    with `printf '[sudo] password for tester: '; read x` and leaves the
    terminal waiting at it. The watcher sees the same
    `password for tester:` prompt, and the assertion is that the password is
    still written exactly once (the login one) — install `sudo` in the
    container to run the plan's command verbatim.
12. **Other specs changed because Stage 5 changed behavior.**
    `shell.e2e.ts`'s landing-card test asserted the Stage 2 "Coming soon"
    toast on Connect; Connect now opens the host's tab, so it waits for that
    tab (and reloads the fixture so no item10 tab exists beforehand).
    `terminal.e2e.ts` and `shell.e2e.ts` each had their own copies of the
    row/tab/buffer/badge helpers; they are hoisted into `e2e/helpers.ts` so
    the ssh spec shares one copy (the terminal spec's helper block shrank from
    ~115 lines to imports).
13. **`states.e2e.ts` calls `fullScreenWindow` through a cast.** tauri-driver
    exposes that command under a different name than the W3C `Browser` type
    declares, and the typed call failed type-check.

## 4. Known issues / TODOs

- **Host-key-changed dialog has no e2e proof.** The sandbox ssh refuses a key
  change (`-F` + strict check), and the plan forbids touching the owner's
  `~/.ssh`. Classification is unit-tested (`hostkey-change` → dialog with the
  hint); the live prompt is a §6 `[human]` check.
- **`Retry` is offered only for refused / unreachable / timeout / auth / dns.**
  `hostkey` and `closed` show `Close` only, per task 5.7.
- **Dialogs are tab-owned and one-at-a-time.** Several failing tabs queue;
  answering one shows the next. No per-tab stacking.
- **Keyboard-interactive prompt capture is best-effort.** The watcher matches
  the prompt banner in the last 4 KiB; a prompt split across chunks at a
  boundary is matched on the next chunk. No real 2FA host exists in the
  sandbox (§6).
- Carried from Stage 4: unread dots are minimal (R13, Stage 6), `bellStyle`
  has no xterm 6 option (R12, Stage 6), and remote hosts still have no
  bookmarks/search (Stage 8) or "Show in File Browser" (Stage 11).

## 5. Stage gate output

`E2E_ALL=1 tools/verify.sh full` (one run, after all tasks):

```
prettier       OK   8s      cargo fmt      OK   0s
eslint         OK   2s      clippy         OK   11s
tsc            OK   3s      cargo test     OK   1s     (65 tests)
vitest         OK   7s      real files     OK   0s
(147 tests, 22 files)       debug build    OK   16s
                           smoke          OK   8s
                           e2e (all)      OK   315s   (46 passing, 9 specs:
                                                       11+3+1+9+1+10+3+7+1)
full verify: all OK
```

`tools/verify.sh full ssh` is the fast loop for this stage (ssh spec only).

## 6. Check on a real device ([human], not automatable here)

- Browse for the identity file: the native dialog opens and picking a file
  fills the field (Stage 3 bullet, V10 fallback).
  yes
- A real host whose key changed: ssh prints
  `WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!`, the dialog shows the
  lines and the `ssh-keygen -R` hint, and FastSSH leaves known_hosts alone.
  Yes
- A real keyboard-interactive / 2FA host: the prompts appear in the terminal
  and the typed password is not echoed.
  yes
- A real `ssh -L` tunnel against a host you own: `curl` through the forwarded
  port works while the tab is open and stops when it closes.
  yes
