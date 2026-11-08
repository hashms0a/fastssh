# HANDOFF — Stage 4: PTY manager, local shell and host notebooks

Status: **Complete** — every Stage 4 Acceptance bullet is proven by its tag.
`tools/verify.sh full terminal` passes end to end (11 steps OK), the terminal
e2e spec is 7/7, vitest is 112 tests / 18 files, `cargo test` is 52 tests.

Read `docs/BUILD_PLAN.txt` (Revision 2) first.

Test Matrix row for this stage: Docker no · Spec `terminal` · ALL no · Perm - ·
Kill - · **Win resize** · Shots 1. The `fastssh-sshd` container was already
`Up` from an earlier session; it was not started, used or stopped here.

## 1. Test-target environment (unchanged from Stage 3)

| check                  | value                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| node / npm             | v26.13.0 / 11.20.0                                                                                                                      |
| rustc / cargo          | 1.99.1 / 1.99.1                                                                                                                         |
| desktop / session      | `ubuntu:GNOME` / wayland                                                                                                                |
| fastssh-sshd container | `Up 11 hours` (Docker = no for Stage 4)                                                                                                 |
| git at session start   | clean except `docs/BUILD_PLAN.txt` and `docs/screenshots/stage_03/editor-ssh-config.png` (both from the Stage 3 session, committed now) |

Last handoff (Stage 3) said "Partially complete" with one failing e2e test, so
this session did **not** rebuild or re-run earlier stages (rule 14): Stage 4 is
not a milestone. The Stage 3 failure is carried over untouched (§4).

## 2. What exists (Stage 4)

Rust (`src-tauri/src/`):

- `utf8_chunker.rs` — `Utf8Chunker::push(&[u8]) -> String`; keeps at most 3
  trailing bytes of a truncated sequence (`valid_up_to()` + `error_len()`),
  invalid bytes become U+FFFD.
- `pty_manager.rs` — `PtyManager { sessions: Mutex<HashMap<String, Session>> }`
  with `spawn(emitter, id, spec, cols, rows)`, `write`, `resize`, `kill`,
  `kill_all`, `session_count`. `SpawnSpec::LocalShell | Ssh(String)`; the Ssh
  line is written into `/bin/sh` as `" exec <line>\n"` (used by the tests and
  by Stage 5). Reader thread: 16 KiB chunks → `Utf8Chunker` →
  `pty-output-<id>`; wait thread: `child.wait()` → remove → `pty-exit-<id>`.
  `clone_killer()` so `kill()` never holds the lock while `wait()` runs.
  Events go through a `SessionEmitter` trait (impl for `AppHandle`).
- `commands/session.rs` — `spawn_session`, `write_pty`, `resize_pty`,
  `kill_session`. Only `host.local == true` is accepted; anything else returns
  `AppError { code: "unsupported" }` ("SSH connections for X are added in
  Stage 5"). Handlers only parse, call and map errors (rule 7).
- `lib.rs` — `.manage(PtyManager::default())`, the four commands registered,
  and `.build(...).run(cb)` with `RunEvent::Exit → kill_all()` (no orphaned
  ssh/sh after a quit).

Frontend:

- `terminal/terminalRegistry.ts` — `Map<tabId, Entry>` (Terminal + FitAddon +
  SearchAddon + WebLinksAddon + host `<div>` + `opened`). `createTerminal` is
  idempotent (StrictMode-safe), `attach()` re-parents the div, `safeFit()` uses
  the exported pure guard `shouldFit(opened, w, h)`, `dispose()` removes the
  entry and the div, `getText()` for the test hook. xterm stays out of React's
  lifecycle, so buffers survive host switches.
- `terminal/terminalOptions.ts` — host color/font → hex + `{family,size}`,
  falling back to the settings; `-1` scrollback → 50000; foreground chosen by
  WCAG contrast; `cursorBlink: true`.
- `terminal/sessionController.ts` — `connectHost`, `closeTab`, `closeHostTabs`,
  `openLocalShell`, `newTabForSelectedHost`, `closeActiveTabOfSelectedHost`.
  Listeners are registered before `spawn_session`; if the tab was closed while
  the spawn was in flight, the new session is killed. `term.onData →
write_pty`, `term.onResize → resize_pty` (looked up by tabId, so Retry in
  Stage 5 can swap the sessionId). PTY chunks are coalesced into one
  `term.write` per animation frame. `pty-exit` waits 50 ms, flushes, then
  closes the tab (task 4.12).
- `store/slices/tabsSlice.ts` — `tabs`, `tabOrder`, `activeTabByHost`,
  `addTab/removeTab/dropHostTabs/setActiveTab/setTabSession/setTabUnread/
setTabLoggedIn/setTabExited`, plus the pure selectors `tabIdsOf`,
  `tabCountOf`, `activeTabOf`, `hostHasUnread`, `nextTabTitle`.
- `components/Workspace/Workspace.tsx` renders **one HostNotebook per host
  with tabs, always mounted**; the selected one gets `flex flex-1`, the others
  `hidden`. A selected host with 0 tabs shows the landing card; a host whose
  last tab closed unmounts its notebook.
- `components/Workspace/HostNotebook.tsx` (tab bar: title, unread dot, close X,
  `+`) and `TerminalPane.tsx` (ResizeObserver → `safeFit`, focus on visible).
- Connect paths (R10): landing `Connect`, the `+` button, double-click on a
  `HostRow`, header **Local Shell** (selects Localhost, opens a tab only if it
  has none), `Ctrl+Shift+T`, `Ctrl+Shift+W`. `lib/shortcuts.ts` is the pure
  matcher (`repeat` rejected first); `hooks/useShortcuts.ts` registers it on
  `window`.
- `HostRow` badge + unread dot (R13 part) with narrow selectors, so PTY output
  re-renders no rows.
- `lib/testHook.ts` — `window.__fastsshTest` (`getText`, `activeTabId`, `cols`,
  `bufferLength`, `tabIds`), installed only when `import.meta.env.DEV ||
MODE === "e2e"`; getters only, never mutates state.
- Removing a host now closes its tabs, and the confirm dialog says
  "N open tabs will be closed".

## 3. Acceptance (Stage 4) — proven as tagged

| bullet                                                                                                                | tag   | evidence                                                                                                                                                                                                                                                                                                                | status |
| --------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `utf8_chunker` cases (split 4-byte emoji, split Cyrillic, invalid bytes, empty push)                                  | unit  | `src-tauri/src/utf8_chunker.rs::tests` — 7 tests                                                                                                                                                                                                                                                                        | OK     |
| `pty_manager` integration: spawn, `echo hi`, exit event                                                               | unit  | `pty_manager::tests::spawn_write_reads_back_and_exits`, `typed_input_reaches_the_child` (`echo $TERM` through `write()`)                                                                                                                                                                                                | OK     |
| `kill_all` kills every child (3 × `sleep 60`, every `wait()` returns)                                                 | unit  | `pty_manager::tests::kill_all_ends_every_child`                                                                                                                                                                                                                                                                         | OK     |
| `tabsSlice` reducers                                                                                                  | unit  | `src/store/slices/tabsSlice.test.ts` — 6 tests (order, active fallback, drop, unread, session/exit)                                                                                                                                                                                                                     | OK     |
| `colors` / `fontSpec` ("Monospace 11", `rgb(0,43,54)` → `#002b36`, invalid → fallback)                                | unit  | `colors.test.ts` (3), `fontSpec.test.ts` (2), `terminalOptions.test.ts` (5)                                                                                                                                                                                                                                             | OK     |
| The shortcut handler ignores `e.repeat`                                                                               | unit  | `shortcuts.test.ts` "ignores auto-repeat"                                                                                                                                                                                                                                                                               | OK     |
| `safeFit` skips a host div of size 0                                                                                  | unit  | `terminalRegistry.test.ts` "shouldFit skips a host div of size 0 or an unopened terminal"                                                                                                                                                                                                                               | OK     |
| Double-click Localhost opens a tab; `echo $TERM $COLORTERM` → `xterm-256color truecolor`; `env \| grep -c APPDIR` → 0 | e2e   | terminal.e2e: `double-click Localhost opens a tab with the sanitized env`                                                                                                                                                                                                                                               | OK     |
| 3 tabs; `seq 1 3000` in tab 2; select item10 (landing visible); back to Localhost; tab 2 keeps `1` and `3000`         | e2e   | terminal.e2e: `3 tabs survive a host switch; scrollback and the badge hold`                                                                                                                                                                                                                                             | OK     |
| Ctrl+Shift+T opens a tab, Ctrl+Shift+W closes the focused one                                                         | e2e   | terminal.e2e: `Ctrl+Shift+T opens a tab, Ctrl+Shift+W closes the focused one` (also proves Local Shell opens none when a tab exists)                                                                                                                                                                                    | OK     |
| `exit` closes the tab; the last tab → `landing-connect`                                                               | e2e   | terminal.e2e: `exit closes the tab and the landing card comes back`                                                                                                                                                                                                                                                     | OK     |
| `setWindowSize(900,600)` then `(1300,800)`; `tput cols` == `cols(activeTabId())`                                      | e2e   | terminal.e2e: `resizing the window resizes the PTY (tput cols == cols(activeTab))`                                                                                                                                                                                                                                      | OK     |
| HostRow badge shows 3, then 2 after a tab closes                                                                      | e2e   | terminal.e2e: same test (`badge("Localhost")` "3" → "2"); also `Sidebar.test.tsx` "shows the open-tab count and the unread dot"                                                                                                                                                                                         | OK     |
| `cat ~/fastssh-testenv/sshd/big.txt`, 1 s, Ctrl+C: prompt back < 10 s, typing still works                             | e2e   | terminal.e2e: `Ctrl+C interrupts a 68 MB cat and the prompt still works` (whole cat→Ctrl+C→`echo alive` cycle stayed under the asserted 25 s, `bufferLength < 60000` so scrollback capped at 50000)                                                                                                                     | OK     |
| Orphans: 3 tabs run `exec -a fastssh-probe bash`; nothing left after the run                                          | agent | `pgrep -af fastssh-probe` after the spec (which quits the app through `quit_app`): only the querying shell matched, no probe process; `pgrep -af target/debug/fastssh` also empty                                                                                                                                       | OK     |
| One screenshot: a notebook with 3 tabs                                                                                | agent | `(screenshot withheld from the public repo: it showed the developer's local username and hostname)` — tab bar `Localhost` / `Localhost (2)` / `Localhost (3)` (active, cyan underline) over a live `dev@devbox:~$` prompt, the Localhost row showing the "3" badge, groups below, a bad-port warning toast bottom-right | OK     |

## 4. Known issues / TODOs

- **Unread dots are minimal (R13 part).** A tab is marked unread when output
  arrives while it is not the foreground tab of the selected host; focusing a
  tab clears it. Output while the _window_ is unfocused is not tracked, and the
  tab dot/row dot visuals are placeholders. Stage 6 finishes R13 together with
  the badge work it owns.
- **xterm 6 has no `bellStyle` option.** The audible-bell setting (R12) is not
  applied to the terminal yet; `term.onBell()` + a sound is the way to wire it,
  which belongs to Stage 6 (terminal tools). Recorded as a deviation, not a bug.
- **Remote hosts cannot connect yet** (by design): `spawn_session` returns
  `unsupported` and the tab closes with an error toast. Stage 5 replaces the
  `Ssh` branch.
- **Stage 3's `library.e2e` test 7** (select-then-remove through the filter)
  is still the open failure from the previous handoff. Untouched and not
  re-run here (rule 14, non-milestone stage).
- A hidden pane's `.xterm-helper-textarea` cannot take focus, so typing always
  goes to the visible tab. The spec's `selectTab()` helper activates a tab
  before typing; that is inherent to the always-mounted design, not a defect.

## 5. Stage gate output

`tools/verify.sh full terminal` (one run, after all tasks):

```
prettier       OK   1s      cargo fmt      OK   0s
eslint         OK   2s      clippy         OK   2s
tsc            OK   1s      cargo test     OK   6s     (52 tests)
vitest         OK   2s      real files     OK   0s
(112 tests, 18 files)       debug build    OK   8s
                           smoke          OK   8s
                           e2e terminal   OK   28s    (7 passing, 24.5 s)
full verify: all OK
```

## 6. Check on a real device ([human])

Unchanged from the earlier handoffs (KDE/Dolphin sftp, KWallet, KWin rendering,
AppImage on clean 22.04/24.04 installs, other GPUs with and without the DMABUF
variable, the session type this machine does not run, native file dialogs).
New for this stage:

- The audible bell's loudness once it is wired (Stage 6).
- Terminal rendering under HiDPI fractional scaling.
- A real remote server with zsh/fish prompts (the local shell here is bash).

## 7. Deviations from the plan

- `PtyManager::spawn` takes `Arc<dyn SessionEmitter>` instead of an
  `AppHandle` directly (the trait is implemented for `AppHandle`), so the
  integration tests capture events in a `Mutex<Vec<String>>` instead of
  `tauri::test::mock_app()`. `AppHandle` stays the argument of the command.
- `RunEvent::Exit` needs `.build(...).run(callback)` instead of `.run(context)`.
- xterm 6.0 dropped `bellStyle`, so `terminalOptions` does not set it (see §4).
- WebKitWebDriver's `findElements("[data-testid=\"tab\"] span")` returns no
  nodes, and `$$().map(async …)` is not an array under the tauri service, so
  tabs expose `data-title` and the spec reads attributes in plain loops.
- `HostRow` keeps the badge/unread `<span>`s present with a `hidden` class
  (instead of removing them) so the Stage 2/3 assertions on those testids keep
  working.
- The Stage 2 "Coming soon" stubs on Connect, double-click and Local Shell are
  gone; those paths now open tabs. `removeHost` gained an "N open tabs"
  confirm line (task 3.8 anticipated it).
- PTY output is batched per animation frame in `sessionController` (the plan
  allowed this if the UI froze; the 68 MB test passes either way, batching
  keeps the sidebar responsive during the stream).

## 8. Next (Stage 5)

`ssh_command.rs` (quoting, tunnels, `~/` expansion, sync mode, sandbox `-F`
prefix), `SpawnSpec::Ssh` from `spawn_session`, `terminal/promptWatcher.ts`,
`FingerprintModal` + `ConnectionErrorModal` with Retry in the same tab, and the
`ssh.e2e.ts` spec against the container. Milestone: also run
`E2E_ALL=1 tools/verify.sh full`. Docker = yes for Stage 5, so start
`fastssh-sshd` and check the sandbox `known_hosts` is empty before the
fingerprint test.
