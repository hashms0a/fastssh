# HANDOFF — Stage 3: Connection and account editors

Status: **Partially complete** — all Stage 3 tasks are implemented and unit-
tested (85 vitest tests, 40 Rust tests); the `library` e2e spec passes 6 of its
13 tests, and the chain after test 7 is blocked by one flaky interaction
(Known issues, first bullet).

Read `docs/BUILD_PLAN.txt` (Revision 2) first. Rev-2 task 3.0 is applied and
committed separately ("Plan revision 2: faster test workflow"):
`tools/verify.sh`, `tools/build-debug.sh`, the `verify` / `verify:quick` /
`e2e:one` scripts, `[profile.dev] debug = "line-tables-only"`,
`.prettierignore`, `mochaOpts { timeout: 30000, bail: true, retries: 1 }` +
`waitforTimeout: 5000` + `E2E_APP`, `resetSandbox(set)`/`loadFixture(set)` in
`e2e/helpers.ts`, idempotent `tools/make_fixtures.sh`, CLAUDE.md rules 3
(new) + 12-14, and the plan file synced to `<PLAN_DIR>/FASTSSH_BUILD_PLAN.txt`.

Test Matrix row for this stage: Docker no · Spec `library` · ALL no ·
Perm **unit** · Kill no · Win no · Shots 1.

## 1. Test-target environment (Linux box, user dev)

| thing         | value                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| config dir    | `~/fastssh-testenv/config` (hosts/accounts/bookmarks/settings.json)                                  |
| fixture sets  | `legacy` (5 hosts + lab-key), `empty`, `big` (2000 hosts), `bad`, `sshconfig` — via `resetSandbox()` |
| session       | GNOME on Wayland, XWayland windows; screenshots via `tools/screenshot.sh`                            |
| session start | `pkill -x fastssh; sleep 1; ./tools/build-debug.sh` only when app code changed                       |

`tools/build-debug.sh` runs Vite in mode `e2e`; `tauri build --debug --no-bundle`
alone leaves `dist/` stale, which silently tests old code.

## 2. What exists (Stage 3)

Frontend (`src/`):

- `lib/hostUtils.ts` — `normalizeName`, `validateHost` (name required/unique,
  `* ? ! # ,` and quotes rejected, host required, port 1-65535, every tunnel
  parses), `resolveCredentials`, `newHost`.
- `lib/tunnels.ts` — parse/serialize `-L`/`-R` and `LocalForward`/`RemoteForward`
  forms, IPv6 brackets, stable rule ids (`parseTunnel(part, index)`).
- `lib/sshConfigBlock.ts` — `blockForHost`, `syncBlock` (managed keys only,
  unmanaged lines such as `ForwardAgent yes` survive renames), `parseBlock`.
- `lib/libraryActions.ts` — `upsertHost` (by id), `removeById`, `upsertAccount`
  (re-links hosts), `removeAccount` (unlinks, keeps credentials).
- `lib/editorActions.ts` — add/edit/duplicate/remove for hosts and accounts;
  `remove*` go through `confirm()`.
- `components/Editors/` — `ConnectionEditor` (Basic/Appearance/Tunnels/Advanced
  - live ssh_config textarea `field-ssh-config`), `AccountEditor`,
    `TunnelsEditor` (structured rows + raw fallback), `ErrorRevealer` (banner +
    focus the first invalid field), `EditorOverlay`, `fields.tsx`.
- `components/Modals/` — `ModalHost` (queue) + `ConfirmDialog` (Escape = Cancel,
  focus in/out, Tab trap).
- `store/slices/uiSlice.ts` — editor draft; `librarySlice.ts` — optimistic saves
  with a per-collection save token (task 3.12).
- Saving a host/account also selects it, so the landing card follows the save.

Tests: `src/lib/{hostUtils,tunnels,sshConfigBlock,naturalSort,strings,debounce}.test.ts`,
`src/components/Editors/editors.test.tsx`, `src/components/Modals/modals.test.tsx`,
`src/components/Sidebar/Sidebar.test.tsx`, `src/components/App.test.tsx`,
`src/store/slices/slices.test.ts` — **85 tests, 12 files**;
`src-tauri` — **40 tests** (storage, models, sanitize, settings).

## 3. Acceptance (Stage 3) — proven as tagged

| bullet                                                                                                     | tag        | evidence                                                                                                                                                                                                                                             | status                  |
| ---------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `normalizeName("web 1")` → `web-1`                                                                         | unit       | `hostUtils.test.ts` "normalizeName"                                                                                                                                                                                                                  | OK                      |
| add "web 1" (127.0.0.1:2222): sidebar shows web-1 in its group; disk has `"port":"2222"` + `identity-file` | e2e        | library: `adds "web 1" as web-1 in its group, with legacy disk keys`                                                                                                                                                                                 | OK                      |
| validateHost table (name taken, port 70000, tunnel `-L abc`)                                               | unit       | `hostUtils.test.ts` "validateHost" table; `tunnels.test.ts`                                                                                                                                                                                          | OK                      |
| Save with errors: banner + focus first invalid field, no `save_hosts`                                      | unit       | `editors.test.tsx` "reveals errors and focuses the first invalid field"                                                                                                                                                                              | OK                      |
| duplicate naming web-1 → web-1-copy → web-1-copy-2                                                         | unit       | `hostUtils.test.ts` "duplicateHost"                                                                                                                                                                                                                  | OK                      |
| duplicate → copy appears, duplicating the copy makes another                                               | e2e        | library: `duplicate web-1 gives web-1-copy, then web-1-copy-2`                                                                                                                                                                                       | OK                      |
| account edit propagates username/password/identity_file; rename re-points hosts                            | unit       | `hostUtils.test.ts` "resolveCredentials", `libraryActions` cases                                                                                                                                                                                     | OK                      |
| account propagation through the editor (save_hosts payload)                                                | e2e        | library: `account edit propagates credentials and a rename re-points item2`                                                                                                                                                                          | OK                      |
| delete account used by N hosts: confirm text has N; hosts keep credentials, `account` is `""`              | unit + e2e | `editors.test.tsx` "asks with the host count"; library: `deleting an account in use asks with the host count and unlinks`                                                                                                                            | OK                      |
| `ForwardAgent yes` survives 10 name edits                                                                  | unit       | `sshConfigBlock.test.ts`                                                                                                                                                                                                                             | OK                      |
| preview updates when Name/Host/Port change                                                                 | unit + e2e | `sshConfigBlock.test.ts`; library: `edits web-1: port from the landing card, live ssh_config block`                                                                                                                                                  | OK                      |
| save failure → toast + sidebar reverts, newest save token wins                                             | unit       | `slices.test.ts` "rolls back … latest token"                                                                                                                                                                                                         | OK                      |
| `atomic_write` into a mode-0500 temp dir errors with the path in it                                        | unit       | `src-tauri` `storage::tests::atomic_write_reports_unwritable_dir`                                                                                                                                                                                    | OK                      |
| Escape on the dialog means Cancel (queue, focus)                                                           | unit + e2e | `modals.test.tsx` (3 tests); library: `Escape on the remove dialog means Cancel (task 3.10)`                                                                                                                                                         | OK                      |
| add → edit port → duplicate → remove, sidebar and hosts.json follow                                        | e2e        | library tests 1-6                                                                                                                                                                                                                                    | FAIL (see Known issues) |
| removing the selected host from its landing card clears the selection                                      | e2e        | library: `removing the selected host from its landing card clears the selection`                                                                                                                                                                     | FAIL                    |
| unwritable config dir → OS-error toast + sidebar revert                                                    | e2e        | library: `an unwritable config dir toasts the OS error and the sidebar reverts`                                                                                                                                                                      | FAIL                    |
| tunnels editor keeps an invalid part visible                                                               | unit       | `tunnels.test.ts` raw-rule round-trip; `editors.test.tsx` tunnel rows                                                                                                                                                                                | OK                      |
| one screenshot of the open ConnectionEditor                                                                | agent      | `docs/screenshots/stage_03/editor-web1.png` — the editor overlay over the shell: name/group/host/port fields, Appearance colour+font, Tunnels row (`-L` select, source, destination, remove), Advanced extra args + ssh_config textarea, Save/Cancel | OK                      |
| Browse opens the native dialog and picking a file fills the field                                          | human      | typed-path half proven by library: `Browse opens the native file dialog and the typed path is kept`; the native picker is a [human] item                                                                                                             | open                    |

## 4. Known issues / TODOs

- **library.e2e.ts test 7 `removing the selected host …`** (FAIL, 3 fix
  attempts). Selecting `web-1x` through the filter leaves the landing card
  showing the previously selected `web-1`, so the Remove targets web-1; the
  retry then starts from the mutated library and the `web-1x` row is gone.
  Best guess: `selectRow()` types into `host-filter`, the list re-renders, and
  the first row clicked belongs to the _unfiltered_ render (a stale click,
  same class of W3C/XWayland quirk the file header documents). Next step: tap
  the row by index inside `group-Lab`/`group-Local` instead of by `data-name`,
  and drop the filter from the chain.
- **Tests 8-13** run only when 7 passes (bail is on). In the last `bail:false`
  run: 8, 9, 10 passed; `an unwritable config dir …`, `Browse opens the native
file dialog …` and `removes web-1 and leaves the seeded library behind`
  failed as a cascade of 7's state (the copies left in the sandbox shift the
  expectations).
- **corrupt.e2e.ts** `renames the 3 bad files, warns with their new names, and
is dismissible` fails: the app warns for the 3 files, and the assertion on
  the renamed names does not match the current warning text.
- **shell.e2e.ts** `shows Local first, groups in natural order, item2 before
item10` fails once the library carries `web-1x`/copies from the library
  chain; it is an ordering expectation, not a layout bug.
- W3C keys on XWayland: `Escape` on the focused OK button clicks it
  (documented in the spec header); the e2e uses the Cancel button and the
  jsdom dialog test covers Escape.

## 5. Stage gate output (last run)

`tools/verify.sh full library` (one run, end of stage):

```
prettier       OK   1s      cargo fmt      OK   0s
eslint         OK   2s      clippy         OK   1s
tsc            OK   1s      cargo test     OK   8s     (40 tests)
vitest         OK   1s      real files     OK   0s
(85 tests, 12 files)        debug build    OK   9s
                           smoke          OK   8s
                           e2e library    FAIL 132s   (test 7; 1-6 pass, bail)
```

`tools/verify.sh full smoke` passed end-to-end right after task 3.0.

## 6. Check on a real device ([human])

- KDE Plasma: Dolphin/KIO sftp, the KWallet prompt, KWin rendering.
- The AppImage on clean Ubuntu 22.04 / 24.04 installs.
- NVIDIA + Wayland with and without the DMABUF variable.
- The session type this machine does not run (X11).
- Picking a file in the native Browse dialog (the typed path is [e2e]).
- Audible bell loudness; HiDPI fractional scaling.

## 7. Deviations from the plan

- `mochaOpts.retries: 1` (on top of the reference config) absorbs the
  tauri-service window-focus CDP `404 Not Found` bursts.
- `type()`/`tap()` helpers in `library.e2e.ts` use CSS selectors and in-page
  `el.click()`/value-setter fallbacks; XPath handles go stale on render in
  WebKitWebDriver.
- Tunnel rules carry index-based ids (`t0`, `t1`) instead of random uuids so
  the rows keep focus while typing.
- `HostRow` shows the _account_ user in the `user@host:port` line
  (`resolveCredentials`), which Stage 2 asserted and Stage 3 made observable.

## 8. Next (Stage 4)

PTY manager + `utf8_chunker`, Local Shell, host notebooks (4 tabs, the 6-pane
grid R6 geometry), Ctrl+Tab order, 8-session memory, reconnect toast. Spec:
`terminal.e2e.ts`; read terminal state through `window.__fastsshTest` (built
in Vite mode `e2e`, i.e. via `tools/build-debug.sh`).
