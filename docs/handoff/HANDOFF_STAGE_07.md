# HANDOFF_STAGE_07 — Complete. Bookmarks popover works (search, add with inline errors, Run into the active tab, confirm-delete, persistence), "Show in File Browser" builds sftp:// URLs and runs the xdg-open -> kioclient -> dolphin chain with the sanitized env, http(s) links in the terminal open through `open_url`, and a failed launcher shows the copy-the-address toast. `verify.sh full bookmarks` passes.

Date: 2026-11-08
Status: Complete
Next stage: 08 — Preferences modal, session restore, quit flow

## 1. Summary

Stage 7 tasks 7.1-7.6 are done. `BookmarksPopover` is the R3 popover on the
header button: a search field that filters on name and command, a list with
Run and Delete per row, an Add form with both fields required and a unique
name, Run disabled with the "Open a terminal first" tooltip when the selected
host has no tab, a confirm dialog before delete, save through `save_bookmarks`,
Escape/outside-click close, focus back on the header button.
`file_browser.rs` builds `sftp://[user@]host:port/` (percent-encoded user,
bracketed IPv6, no `user@` when empty) and runs the launcher chain behind an
injectable runner, so the whole fallback order is a cargo test.
`open_url` accepts only http/https. The failure path is Section 2's toast:
message names the address, plus a Copy button that writes it to the clipboard.
Gate ran once (`tools/verify.sh full bookmarks`); Docker was started for this
stage (Test Matrix Docker = yes) and stopped afterwards.

## 2. Environment (unchanged since Stage 0A)

Ubuntu 24.04 / GNOME / Wayland + XWayland, x86_64, screen 2560x1440.
Node v26.13.0, npm 11.20.0, rustc 1.99.1, cargo 1.99.1,
`XDG_CURRENT_DESKTOP=ubuntu:GNOME`, `XDG_SESSION_TYPE=wayland`, tauri 2.12.5 /
tauri-cli 2.12.4. Tools: gpg 2.4.8, OpenSSH 10.2p1, xdg-open, kioclient,
gio + gvfsd-sftp, nautilus 50.2.2, WebKitWebDriver, tauri-driver,
gnome-screenshot. **No `dolphin` on this machine** (KDE-only fallback).
No package was installed and no sudo was used in this session.
Sandbox `~/fastssh-testenv`; owner's `~/.ssh`, `~/.config/easyssh`,
`~/.config/fastssh` untouched (verify.sh "real files OK").
Container `fastssh-sshd`: **started** for this stage, stopped at the end.
Machine changes: none. One environment fact found: GNOME's Nautilus 50
registers no `x-scheme-handler/sftp`, so `xdg-open sftp://…` goes to `gio`,
which fails with "The specified location is not mounted" (exit 4) because the
GVFS mount needs an interactive password. See §10 and MANUAL_CHECKS.md.

Session start: `HEAD = b4c7af6 "Stage 06: terminal tools, search toolbar,
Alt+C/Alt+Up, unread badges, shortcut matrix"`. The only working-tree change
was `docs/handoff/HANDOFF_STAGE_06.md`, where the owner answered the two open
questions ("keep" for both); it is committed with this stage, unchanged. No
Stage 6 rebuild or re-test (its handoff says Complete).

## 3. Requirements touched by this stage

Other rows keep the status in HANDOFF_STAGE_06 §2.

| Req | Status | What changed here                                                                                                                                                                                                                                                                       |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R3  | Done   | BookmarksPopover: search on name+command, list with Run/Delete, Add form (both required, name unique, inline errors), Run writes `<command>\n` to the active tab, disabled + tooltip with no tab, confirm before delete, save_bookmarks, Escape/outside click, focus back on the button |
| R12 | Done   | web links now go to `open_url` (was log-only); non-http schemes are refused and reported                                                                                                                                                                                                |
| R16 | Done   | `file_browser.rs` + `open_sftp_file_browser` + Ctrl+Shift+E + the context-menu item (remote only), sync-mode target from the ssh_config block, failure toast with the address and a Copy button                                                                                         |
| R17 | Done   | Ctrl+Shift+E now performs the action instead of toasting "Coming soon"                                                                                                                                                                                                                  |
| R20 | Done   | the new children (`xdg-open`, `kioclient`, `dolphin`) go through `sanitize_std_command`                                                                                                                                                                                                 |

## 4. Files created / modified

Created

- `src-tauri/src/file_browser.rs` (+ `file_browser/tests.rs`, 9 cargo tests) - `sftp_url`, `is_web_url`, `launch_plan`, `launch_with(injected runner)`, `exec` (wait/detach), `open_sftp`, `open_web_url`
- `src/lib/bookmarks.ts` (+ `.test.ts`) - pure rules: `normalizeBookmarkName`, `validateBookmark`, `errorsFor`, `filterBookmarks`, `addBookmark`, `removeBookmark`
- `src/lib/sftpTarget.ts` (+ `.test.ts`) - `blockValue` (ssh_config line reader) + `browserTarget` (account credentials, sync-mode HostName/Port/User)
- `src/lib/fileBrowser.ts` - `showFileBrowserFor`, `isLocalHost`, `urlInMessage`; the failure toast carries the address
- `src/lib/errorText.ts` - unwraps a Rust `AppError` (`{code,message}`) instead of `String(e)` -> "[object Object]"
- `src/components/BookmarksPopover.tsx` - the popover (testids: `bookmarks-popover`, `bookmark-search`, `bookmark-list`, `bookmark-row[data-name]`, `bookmark-run`, `bookmark-delete`, `bookmark-name`, `-name-error`, `bookmark-command`, `-command-error`, `bookmark-add`, `bookmark-empty`)
- `src/lib/fileBrowser.test.tsx` (7 tests), `src/terminal/terminalActions.test.ts` (5)
- `e2e/specs/bookmarks.e2e.ts` (4 tests)
- `(screenshot withheld from the public repo: it showed the developer's local username and hostname)`
- `docs/MANUAL_CHECKS.md` - created with the Stage 7 `[human]` items

Modified

- `src-tauri/src/commands/system.rs` - `open_sftp_file_browser`, `open_url` (both `spawn_blocking`, §9-style `blocking` helper)
- `src-tauri/src/lib.rs` - `pub mod file_browser;` + the two commands in `generate_handler!`
- `src/lib/ipc.ts` - `openSftpFileBrowser`, `openUrl`
- `src/terminal/terminalActions.ts` - `showFileBrowser(tabId?)` (host of the tab or the selected host) and `runBookmark(command)` (writes through `writeTab`, so `writeCount` sees it)
- `src/terminal/openLink.ts` - `ipc.openUrl(uri)` + a toast on refusal/failure
- `src/components/Workspace/TerminalPane.tsx` - the menu item is enabled for remote hosts, its tooltip is now the remote-only explanation
- `src/components/HeaderBar.tsx` - the Bookmarks button is live and anchors the popover; closing returns focus to it
- `src/store/slices/uiSlice.ts` - `Toast.copy` + `pushToast(message, kind, copy)`
- `src/components/Toasts.tsx` - a `toast-copy` button when `copy` is set; toast and warning boxes got `pointer-events-auto`
- `src/lib/strings.ts` - the bookmark/file-browser strings + `validation.commandRequired`
- `e2e/helpers.ts` - `typeInto` now focuses the field (see deviation 3)
- `e2e/specs/tools.e2e.ts` - the Ctrl+Shift+E row now asserts the remote-only message (deviation 4)

## 5. Architecture notes

- URL building and the launcher chain are pure Rust data + a runner closure:
  `launch_plan(url, desktop)` returns the ordered `Launch` specs
  (`wait: Some(10 s)` for xdg-open/kioclient, `None` = spawn-and-reap for
  dolphin), `launch_with` walks them with an injected runner, `exec` is the
  real one. No test starts a program.
- Every attempt is logged (`open_sftp program=xdg-open ok=false url=…`), and
  the success line names the method (`open_sftp method=kioclient …`), which is
  what the e2e spec greps in `~/.local/share/io.github.fastssh.app/logs/FastSSH.log`.
- Target resolution stays in TypeScript (`sftpTarget.ts`) so the command keeps
  the plan's `(username, host, port)` signature: account credentials first
  (R2), then in sync mode the block's `User`/`HostName`/`Port` (first line wins,
  `Key=value` and quoted values handled), falling back to the record's fields.
- Bookmarks: the popover keeps its own query/draft state (closing resets it);
  all edits go through `librarySlice.saveBookmarks`, which is optimistic and
  rolls back with an error toast on an OS failure.
- Run goes through `promptActions.writeTab`, i.e. the same path as typed input,
  so the PTY gets `"<command>\n"` and the write log can count it.
- `Toast.copy` is the only way a user can recover the address when no file
  manager answers; the toast is an error toast, so it persists until dismissed.

## 6. Data / settings schema

Unchanged: `schemaVersion: 1`, no AppSettings field added. Bookmarks stay in
the legacy EasySSH shape (`id`, `name`, `command`) as a top-level array.

## 7. Dependencies added or changed in this stage

- npm: none (nothing new is imported; `@tauri-apps/plugin-opener` stays unused — the launchers are run in Rust per the plan)
- cargo: none. No capability change: the two openers are Rust commands, not JS APIs.

## 8. Deviations from the plan and why

1. **Sync-mode target resolution lives in TS, not in the command.** Task 7.4
   says "for a host in sync mode, use the host's real host/port/user". The
   ssh_config block is a frontend-side string until Stage 9 owns `ssh_config`
   parsing, so `sftpTarget.ts` reads it (unit-tested) and the Rust command
   keeps the plan's `open_sftp_file_browser(username, host, port)` shape.
2. **The launcher chain is a `Launch` struct + one runner closure.** The plan's
   reference shows `run_wait(prog, url, timeout)` plus inline kioclient/dolphin
   spawns; the acceptance bullet needs the _order_ testable without starting
   programs, so the order is data (`launch_plan`) and the runner is injected.
   Behaviour is the plan's: 10 s wait, "still running = launched", KDE-only
   fallbacks, dolphin detached and reaped in a thread.
3. **`e2e/helpers.ts typeInto` focuses the field instead of dispatching a
   click.** The popover autofocuses its search field, and a dispatched
   `MouseEvent("click")` does not move focus, so the first `typeInto` typed
   into the search box (found as an empty bookmark list in the first run).
   `typeInto` is shared by the Stage 6 specs; both were re-run and pass
   (9 + 2 tests).
4. **The Stage 6 spec's Ctrl+Shift+E assertion changed** ("Coming soon" -> the
   remote-only message). Stage 7 wires the action, and the owner answered the
   Stage 6 open question with "keep", so Localhost stays refused.
   `e2e/specs/tools.e2e.ts` was updated and re-run.
5. **`Toast` gained a `copy` field and toast boxes `pointer-events-auto`.**
   Task 7.5 needs a Copy button, and the toast container is
   `pointer-events-none`, so without this neither Dismiss nor Copy would be
   clickable for a human (an existing Stage 2 bug the new button made visible).
6. **`errorText.ts`** - a Rust `AppError` arrives as an object, and the earlier
   stages' `String(e)` toasts would read "[object Object]". Stage 7's two new
   call sites use `errorText`; earlier call sites were left alone (rule 2).
   Stage 8/12 may adopt it everywhere.
7. **The file-manager screenshot is impossible on this machine** - see §10;
   the e2e spec asserts the specified failure path instead, and the agent's
   screenshot shows the toast with the address and the Copy button.

## 9. Verification

`tools/verify.sh full bookmarks` (one run after all tasks; Stage 7 is not a
milestone, so no `E2E_ALL`):

```
prettier       OK   1s      debug build    OK   9s
eslint         OK   2s      smoke          OK   8s
tsc            OK   3s      e2e bookmarks  OK   22s  (4 passing)
vitest         OK   3s      full verify:   all OK
cargo fmt      OK   0s      real files     OK   0s
clippy         OK   0s
cargo test     OK   6s
```

Test counts: vitest 229 passed / 30 files, cargo 74 passed, e2e 4 passed
(bookmarks). Because `typeInto` and the Stage 6 Ctrl+Shift+E row changed, the
Stage 6 specs were re-run: `tools.e2e.ts` 9 passing, `tools-menu.e2e.ts` 2
passing. That run re-took `(screenshot withheld from the public repo: it showed the developer's local username and hostname)` (the
Stage 6 spec's own shot); it still shows the toolbar with "2 / 2" and the
bad-port toast, and now also the live Bookmarks button.

Acceptance, one row per bullet:

| Bullet                                                                                                                                                                      | Tag         | Proof                                                                                                                                                                                                                                                                                                                                                                                                                       | PASS               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| sftp URL building (IPv6, encoded user, empty user)                                                                                                                          | unit        | `file_browser/tests.rs`: `sftp_url_for_a_plain_host`, `sftp_url_omits_an_empty_user`, `sftp_url_percent_encodes_the_user`, `sftp_url_brackets_an_ipv6_host`                                                                                                                                                                                                                                                                 | PASS               |
| `open_url` rejects `file:`, `javascript:`, `ssh:`                                                                                                                           | unit        | `only_http_and_https_are_web_urls` (also ftp/mailto/httpx), `open_web_url_refuses_other_schemes_without_running_anything`                                                                                                                                                                                                                                                                                                   | PASS               |
| Launcher order with an injected runner (xdg-open -> kioclient -> dolphin on KDE; stops after xdg-open elsewhere); error contains the URL                                    | unit        | `the_plan_starts_with_xdg_open_and_adds_kde_fallbacks`, `launch_order_with_an_injected_runner`, `the_failure_message_names_the_url_for_copying`                                                                                                                                                                                                                                                                             | PASS               |
| On that error the UI shows the toast with the URL and a Copy button that writes it to the clipboard (mocked IPC)                                                            | unit        | `src/lib/fileBrowser.test.tsx`: "keeps the error toast until dismissed and carries the URL for copying", "renders a Copy button that writes the URL to the clipboard" (asserts `plugin:clipboard-manager\|write_text`)                                                                                                                                                                                                      | PASS               |
| bookmarks.e2e.ts: add, search, run, delete; duplicate name inline error; Run disabled with no tab; "hello" -> `echo bookmark-ok` in a Localhost tab; survives reloadSession | e2e         | `bookmarks.e2e.ts` "adds a bookmark, runs it in a Localhost tab, and still has it after a restart", "deleting asks for confirmation; Cancel keeps the bookmark"                                                                                                                                                                                                                                                             | PASS               |
| A bookmark `echo remote-$(hostname)` in an item10 tab prints the container's hostname                                                                                       | e2e         | `bookmarks.e2e.ts` "a bookmark run in an item10 tab prints the container hostname" (compares with `docker exec fastssh-sshd hostname` and the local `hostname`)                                                                                                                                                                                                                                                             | PASS               |
| The last `it` connects item10 and presses Ctrl+Shift+E; the log names the method                                                                                            | e2e + agent | `bookmarks.e2e.ts` "Ctrl+Shift+E asks for sftp://tester@127.0.0.1:2222 and offers to copy the address" (+ `fs` grep of the app log inside the spec)                                                                                                                                                                                                                                                                         | PASS               |
| The agent's screenshot of the file manager at sftp://…                                                                                                                      | agent       | Not possible here: no launcher accepts the URL on this GNOME install. Quoted log lines instead: `open_sftp program=xdg-open ok=false url=sftp://tester@127.0.0.1:2222/` and `open_sftp no launcher accepted url=sftp://tester@127.0.0.1:2222/` (from `~/.local/share/io.github.fastssh.app/logs/FastSSH.log`). Screenshot shows the resulting toast; the file-manager check is a `[human]` item in `docs/MANUAL_CHECKS.md`. | FAIL (environment) |
| Clicking https://example.com opens the browser; file:///etc/passwd does not                                                                                                 | human       | `docs/MANUAL_CHECKS.md`; the scheme rule is unit-proven                                                                                                                                                                                                                                                                                                                                                                     | -                  |
| The other desktop's file-manager path (kioclient/dolphin)                                                                                                                   | human       | `docs/MANUAL_CHECKS.md` (`dolphin` is not installed here)                                                                                                                                                                                                                                                                                                                                                                   | -                  |

Screenshot (1 of the 1 allowed): `(screenshot withheld from the public repo: it showed the developer's local username and hostname)`
— the item10 notebook logged into the container (`tester@8d4c59aa80d5:~$`), the
live Bookmarks button in the header, and bottom-right the error toast "Could not
open a file browser. Copy this address: sftp://tester@127.0.0.1:2222/" with its
Copy and Dismiss buttons, plus the "Copied the address" info toast and the
Stage-1 bad-port warning.

- Env-sanitize grep: `Command::new` appears once outside `env_sanitize.rs`
  (`file_browser.rs:126`), and it is behind `sanitize_std_command`; the PTY
  path uses `sanitize_pty_command`. OK.
- Real-files guard: OK.

## 10. Known issues / TODOs

- **No sftp:// launcher answers on this machine** (`xdg-open` -> `gio` ->
  "The specified location is not mounted", exit 4; Nautilus 50 registers no
  `x-scheme-handler/sftp`, and the GVFS mount asks for a password on the
  terminal). Impact: on GNOME here, R16 always ends in the copy-address toast,
  which is the behaviour Section 2 specifies for "no file manager responds";
  the file-manager window itself is unverified. Fix: nothing in the app - the
  chain is the plan's. A Stage 11 candidate is a `gio mount <url>` step (and a
  `kioslave`/`gio` option in Preferences) for machines whose handler is missing.
  Verified by hand: `timeout 12 gio mount sftp://tester@127.0.0.1:2222/` prints
  "Enter password for "tester" on "127.0.0.1"" and exits 2. The agent never
  types that password.
- **`dolphin` is not installed here**, so the third fallback is only unit-proven.
- **Bookmarks Run targets the active tab of the selected host** (R3/R10). With
  the sidebar in Accounts mode the selected host's tab still receives the
  command, which matches EasySSH. No change.
- **The popover closes when Run is pressed** so the output is visible; if the
  user wants to run several bookmarks they must reopen it. See open question 2.
- **`e2e/helpers.ts` is ~390 lines** (shared spec helpers; rule 7 is written for
  src modules, which stay under 300).
- Carried from Stage 6: `Copied N lines` counts buffer rows (owner: keep),
  clipboard runs on arboard's X11 fallback, search highlights cap at 1000.

Check on a real device (`[human]`, all in `docs/MANUAL_CHECKS.md`)

- A https link in the terminal opens the default browser; a `file://` one does not.
- KDE Plasma: kioclient/dolphin open `sftp://user@host:port/`; GNOME with a
  Nautilus that handles sftp:// shows the GVFS password dialog (type it yourself).
- Sync mode + "Show in File Browser" opens the block's real address (re-check
  after Stage 9 owns the block).
- The popover with 50+ bookmarks: scrolling, long commands, Escape while the
  delete confirm is open.

## 11. Instructions for the next stage (08: preferences, restore, quit flow)

- First files to open: `src/store/slices/settingsSlice.ts` (debounced save +
  `flushSettings`), `src/hooks/useCloseHandler.ts`, `src/components/Modals/`
  (add `PreferencesModal` to `ModalHost`'s kinds or use the editor overlay),
  `src/terminal/terminalOptions.ts` + `terminalRegistry.ts` (live re-apply),
  `src-tauri/src/storage.rs` (a `set_hosts_folder` command), `src/lib/ipc.ts`.
- Pitfalls noticed:
  - `browser.reloadSession()` kills the app mid-spec: press Ctrl+Q only in the
    last `it` that needs it, then relaunch and re-wait for `header-bar`.
    `quitApp()` in helpers.ts already invokes `quit_app` from the page.
  - `settings.json` and `openedHosts` are readable with `node:fs` from the spec
    via the exported `configDir` in helpers.ts.
  - Restoring several ssh hosts queues several fingerprint/error modals —
    `dialogSlice` renders one at a time; click `fingerprint-yes` in a loop.
  - Test Matrix for Stage 8: Docker = yes, Spec = `preferences`, **milestone**
    (run `E2E_ALL=1 tools/verify.sh full`), Kill = yes, 1 screenshot. Start
    `fastssh-sshd` again.
  - `errorText(e)` is the helper for any toast fed by a Rust `AppError`.

## 12. Open questions for the human

- When every launcher fails, should FastSSH also try `gio mount <url>` (GVFS)
  before the copy-address toast? It needs the user to type the password in a
  terminal or a portal dialog, which the app cannot drive.
  See what is the best option.

- Should "Run" keep the popover open so several bookmarks can be run in a row
  (it currently closes it so the terminal output is visible)?
  No.
