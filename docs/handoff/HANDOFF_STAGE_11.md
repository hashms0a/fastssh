# HANDOFF_STAGE_11 — Complete. Three of the owner's chosen extras are in: a tab can be dragged onto another tab to reorder the notebook and double-clicked to rename it (titles live on the tab, never on disk), one header-menu press writes the whole library into a single JSON file under `<hostsFolder>/backups/` (plain, or armored gpg when Encrypt data is on), and a new Preferences switch reopens the Localhost tabs of the previous run. Stage 10's open question 1 became a real action: `Lock library` drops the passphrase from Rust and puts the unlock modal back up.

Date: 2026-11-08
Status: Complete
Next stage: 12 — Polish, error-handling review, accessibility, icon, full tests, 22.04 AppImage, README

## 1. Summary

Stage 11 is "optional, P1 -> P3"; §12.3 of HANDOFF_STAGE_10 named the three
items to build, and the plan's priority order was kept for those. What exists
now:

- **Tab reorder + rename (P2)** — `src/lib/tabReorder.ts` (pure: `moveOnto`,
  `tabTitle`) + `tabsSlice.moveTab/renameTab`. `TabButton.tsx` (new file, split
  out of `HostNotebook.tsx` so both stay under 300 lines) is `draggable`,
  reports the drag to the notebook, and renders an inline `input` on a
  double-click. The dragged id lives in a ref as well as in state, so a drop
  reads it even before the highlight re-render. The drop target gets a dashed
  accent border. A drop on another host's notebook is a no-op by construction:
  `moveTab` only ever edits that notebook's `tabOrder`.
- **Library backup (P2)** — `src-tauri/src/export.rs` + `commands/export.rs`
  (`export_library`). One pretty-printed JSON object: `{app, schemaVersion,
exportedAt, hosts, accounts, bookmarks}` where each array uses the same
  record shape the library files use, so `jq` reads it and a future restore can
  feed each array to the Stage 1 lenient parsers. Automatic target
  `<hostsFolder>/backups/fastssh-library-<UTC stamp>.json`; a typed path is
  used as-is (`~/` expanded) with `.gpg` appended when encryption is on. Never
  overwrites, always reads the bytes back and compares, folder 0700 / file 0600.
  Menu entries `Back up library` and `Export library…` (native save dialog);
  both are disabled while the library is locked, and an encrypted library
  without the passphrase is refused instead of exported as an empty file.
- **Restore Localhost tabs (P3)** — new `AppSettings.restoreLocalhost`
  (default `false`, schema still v1). `quitFlow.openedHostsFor` lists Localhost
  only when it is on, `restorePlan(…, includeLocal)` lets the in-memory host
  through only then, and Preferences shows the switch disabled with a tooltip
  until `Restore hosts on startup` is on.
- **Lock library now (the answer to Stage 10 §12.1)** — `lock_library`
  command + `cryptoActions.lockLibrary` + the menu item, enabled only when
  encryption is on and the library is unlocked. Chosen over an idle timer: a
  timer would surprise the user mid-work, and a "lock on window blur" would
  lock every time another window is focused. Files are untouched, open tabs
  keep their sessions, and the next read or save needs the passphrase again.
- **Tests**: +38 vitest (4 new files, 2 extended), +9 cargo (1 new module), +15
  e2e in 3 new specs.

## 2. Environment (unchanged since Stage 0A)

Ubuntu 24.04 / GNOME / Wayland + XWayland, x86_64, screen 2560x1440.
Session start (plan rule 8): Node v26.13.0, npm 11.20.0, rustc 1.99.1,
cargo 1.99.1, `ubuntu:GNOME wayland`, container `fastssh-sshd` **stopped**
(Stage 11's own specs need no sshd). `HEAD = a70ee47 "Stage 10: gpg encryption
and EasySSH import"`; the tree was clean apart from the owner's answers in
`docs/handoff/HANDOFF_STAGE_10.md`, so nothing was rebuilt or re-tested before
starting (that handoff says Complete).
**No package was installed and no sudo was used in this session.** Machine
changes: none.
The container was **started only for the milestone `E2E_ALL=1` run** (the ssh
specs need it) and stopped afterwards; `bash tools/make_fixtures.sh` restored
`~/fastssh-testenv/ssh/config` and the run's `ssh/config.backup*` files were
deleted. `~/fastssh-testenv/config/backups/` now holds the backups the specs
wrote - sandbox data, safe to delete.
The owner's `~/.ssh`, `~/.config/easyssh`, `~/.config/fastssh` were not touched
(verify.sh "real files OK" in both runs).

## 3. Requirements touched by this stage

Nothing in R1-R22 changed status; these are the extras on top of them. Other
rows keep the status in HANDOFF_STAGE_10 §3.

| Req | Status | What changed here                                                                                                                                               |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R10 | Done   | Host-owned notebooks gained the two tab gestures: drag to reorder within a notebook, double-click to rename (title on the tab object only)                      |
| R13 | Done   | Reorder keeps the active tab and the unread dots; `TabButton` still renders the dot and the close button next to the title or the rename field                  |
| R19 | Done   | `restoreLocalhost` (new setting) also writes and reopens the Localhost tabs; `restoreHosts` stays the master switch and gates the new one                       |
| R6  | Done   | `lock_library` drops the passphrase from `AppState`; `export_library` writes an armored `.json.gpg` copy when `encryptData` is on, and refuses a locked library |
| R4  | Done   | One new file location: `<hostsFolder>/backups/` (0700) holding single-file library copies (0600); the three library files are never touched                     |
| R18 | Done   | Preferences General gained `Restore local shells too`, disabled with a tooltip while `Restore hosts on startup` is off                                          |
| R20 | Done   | No new subprocess: the backup goes through `storage::atomic_write`, and the encrypted copy through the existing sanitized `GpgRunner`                           |

## 4. Files created / modified

New:

- `src/lib/tabReorder.ts` + `.test.ts` - `moveOnto`, `tabTitle`, the 64-char cap (created)
- `src/components/Workspace/TabButton.tsx` + `.test.tsx` - drag source/target + inline rename (created)
- `src/lib/backup.ts` + `.test.ts` - the backup action as a pure, injected function (created)
- `src/lib/backupActions.ts` + `.test.ts` - store/IPC/dialog glue for the menu (created)
- `src-tauri/src/export.rs`, `src-tauri/src/export/tests.rs` - payload, stamp, target, verify (created)
- `src-tauri/src/commands/export.rs` - `export_library` handler (created)
- `e2e/specs/tabs.e2e.ts` (5), `e2e/specs/backup.e2e.ts` (7), `e2e/specs/restore-local.e2e.ts` (3) (created)
- `(screenshot withheld from the public repo: it showed the developer's local username and hostname)`, `docs/screenshots/stage_11/header-menu.png` (created)

Modified:

- `src/store/slices/tabsSlice.ts` (+ its test) - `moveTab`, `renameTab` (modified)
- `src/components/Workspace/HostNotebook.tsx` - imports `TabButton`, owns the drag ref + highlight state (modified)
- `src/store/slices/librarySlice.ts` - `setLocked` (modified)
- `src/lib/cryptoActions.ts` (+ test) - `lockLibrary` (modified)
- `src/lib/quitFlow.ts` (+ test), `src/lib/restore.ts` (+ test), `src/hooks/useRestoreTabs.ts` - the Localhost rule (modified)
- `src/types/models.ts`, `src-tauri/src/settings.rs` (+ test) - `restoreLocalhost` (modified)
- `src/components/Modals/PreferencesModal.tsx` (+ test) - the new switch (modified)
- `src/components/HeaderBar.tsx` - three menu items (modified)
- `src/lib/ipc.ts` - `exportLibrary`, `lockLibrary`, `ExportReport` (modified)
- `src/lib/strings.ts` - backup / lock / restore-local strings (modified)
- `src/test/ipcMock.ts` - `export_library` answer (modified)
- `src-tauri/src/lib.rs` (+ `commands/mod.rs`) - `export` module, two new commands (modified)
- `docs/MANUAL_CHECKS.md` - Stage 11 [human] items (modified)
- `docs/handoff/HANDOFF_STAGE_10.md` - the owner's answers were already in the working tree and are committed with this stage (modified)

## 5. Architecture notes

- **Tab titles are session state.** `renameTab` writes only `tabs[id].title`.
  Tabs are never serialized, so the e2e spec can assert that no file in the
  config folder ever contains the typed title, and a restart has no tabs at all.
- **Drag is per notebook.** `HostNotebook` owns the dragged id (a ref for the
  drop, state for the highlight) and calls `moveTab(host.id, …)`, so a drop on
  another host's tab bar cannot move a tab between hosts. `moveOnto` returns the
  original order untouched when either id is missing - the guard for exactly
  that case.
- **The rename field survives the pane that steals its focus.** Double-clicking
  a background tab selects it, which mounts its terminal pane, which focuses its
  xterm - and that blur used to commit and close the field instantly. A blur
  within 300 ms of opening the field is treated as that focus grab: the field
  keeps editing and takes the focus back. A real blur after that commits.
- **The backup reads the library from disk, not from the store.**
  `storage::report_from(data_dir(settings), …)` is the same entry point the
  loader uses, so an encrypted library without a passphrase comes back `locked`
  and the command refuses rather than writing an empty copy. It never calls any
  save function: the three library files are read-only for this command.
- **Settings stays single-writer.** `export_library` and `lock_library` change
  no settings and write no settings file; `restoreLocalhost` travels through the
  frontend's debounced `updateSettings` + flush like every other field.
- **The passphrase stays Rust-only.** `lock_library` sets
  `AppState.passphrase` to `None`; the frontend only flips its own `locked`
  flag, which is what renders the unlock modal (Stage 10's mechanism). No
  passphrase is ever read back out of Rust.
- **`stamp()` is pure** (`export.rs`, civil-from-days) so the backup name is
  testable without a clock; the command passes `SystemTime` seconds.

## 6. Data / settings schema

`schemaVersion` stays **1** - one more field with a default is read by the
lenient parser, exactly as Stage 2 added `collapsedGroups` (settings.rs comment
says so). A file written before this stage parses with `restoreLocalhost:
false`.

- `settings.json` gained `restoreLocalhost: boolean` (default `false`); the full
  list is now 18 fields (HANDOFF_STAGE_08 §6 + this one).
- New on-disk location: `<hostsFolder>/backups/` (mode 0700) containing
  `fastssh-library-<YYYYMMDD-HHMMSS>.json` or `.json.gpg` (mode 0600), written
  atomically. The document is `{app:"FastSSH", schemaVersion:1, exportedAt,
hosts[], accounts[], bookmarks[]}` with the legacy record keys per entry
  (`port` as a string, `identity-file`, `extra-arguments`). Localhost never
  appears: it is not on disk.
- Nothing else changed; `settings.json` stays plain even when encryption is on.

## 7. Dependencies added or changed in this stage

- npm: none (`package.json`, `package-lock.json` untouched).
- cargo: none (`src-tauri/Cargo.toml`, `Cargo.lock` untouched).
- No new external binary; no new Tauri plugin (the save dialog uses the
  `tauri-plugin-dialog` capability added in Stage 3).

## 8. Deviations from the plan and why

1. **The automatic backup target is `<hostsFolder>/backups/<stamp>` instead of
   a path picked by a dialog.** One menu press then needs no interaction, which
   is what makes the feature assertable at all: a native dialog cannot be driven
   by tauri-driver. `Export library…` keeps the dialog route for copying to a
   USB stick. `files: src-tauri/src/export.rs, src/lib/backupActions.ts,
src/components/HeaderBar.tsx`.
2. **`export_library(path: Option<String>)` is one command, not two.** The only
   difference between the two menu entries is where the file goes.
   `files: src-tauri/src/commands/export.rs`.
3. **The backup document is an object with a header, not a bare array.** The
   plan says "a single JSON file" without a shape; a header
   (`app/schemaVersion/exportedAt`) makes it self-describing, and keeping the
   three arrays in the existing record shape means a later "restore from a
   backup" can pass each array to the Stage 1 parsers. `files:
src-tauri/src/export.rs`.
4. **`lock_library` command + the `Lock library` menu item** - not in the plan's
   command list, but §12.1 of Stage 10 asked for a decision and the owner
   wrote "see what is the best option". The explicit action is the best option
   (see §5); an idle auto-lock was rejected as surprising. `files:
src-tauri/src/commands/crypto.rs, src/lib/cryptoActions.ts,
src/components/HeaderBar.tsx`.
5. **`TabButton` moved out of `HostNotebook.tsx`** - the gestures plus the
   rename field pushed that file past the 300-line rule's spirit (rule 7).
   `files: src/components/Workspace/TabButton.tsx`.
6. **One e2e spec per item** (`tabs`, `backup`, `restore-local`) - the Test
   Matrix's Spec column for Stage 11 is "per item", so each item's acceptance
   names its own file instead of one mixed spec.
7. **The drag is dispatched as HTML5 drag events inside the spec.** A W3C
   pointer drag (`element.dragAndDrop`) starts no HTML5 drag under
   tauri-driver/WebKitWebDriver, so the spec fires `dragstart`, `dragover`
   (`preventDefault`) and `drop` on the tab rows. The real mouse gesture is a
   [human] item in `docs/MANUAL_CHECKS.md`. `files: e2e/specs/tabs.e2e.ts`.
8. **A `dblclick` event reaches React only with `view` and `detail: 2`** in this
   WebKit build; a bare `new MouseEvent("dblclick")` fires nothing. The helper
   in the spec says so. `files: e2e/specs/tabs.e2e.ts`.
9. **`restoreLocalhost` does not reset itself when `restoreHosts` is turned
   off.** The switch is disabled and both code paths check `restoreHosts`
   first, so a stale `true` cannot restore anything. `files:
src/components/Modals/PreferencesModal.tsx`.

## 9. Verification

Milestone gate `E2E_ALL=1 tools/verify.sh full` (container started for it, all
files as they are in this handoff):

```
prettier       OK   2s   eslint       OK   3s   tsc          OK   3s
vitest         OK   6s   cargo fmt    OK   0s   clippy       OK   0s
cargo test     OK  17s   real files   OK   0s   debug build  OK   9s
smoke          OK   8s   e2e (all)    OK 344s
full verify: all OK
```

It failed once before that, at `tsc`: `titleOf` awaited the wrong expression and
`threeTabs()` returned `string[]` where the spec indexes it under
`noUncheckedIndexedAccess`. Both fixed in the spec, then the gate was run once
more.

Per-item gates while developing (each run before the milestone):
`npx wdio run e2e/wdio.conf.ts --spec e2e/specs/tabs.e2e.ts` (5 passing),
`… --spec e2e/specs/backup.e2e.ts` (7 passing),
`… --spec e2e/specs/restore-local.e2e.ts` (3 passing).

- Test counts: **vitest 362** (was 324; +38 in 4 new files + 3 extended),
  **cargo test 141** (was 132; +9), **e2e 89 passing / 18 spec files, 0 failing**
  (whole suite; the three Stage 11 specs contribute 15).

Acceptance (one row per bullet; the plan's Stage 11 acceptance is "each
implemented item has its own tests and an acceptance line"):

| Bullet (short)                                                                                                                     | Tag            | Proof (test name, or command + output)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | PASS/FAIL |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| Item 1: reorder rule - backward, forward, self-drop, foreign id, no in-place mutation                                              | [unit]         | `tabReorder.test.ts > moveOnto (Stage 11 tab reorder)` (5 cases)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | PASS      |
| Item 1: `moveTab` keeps the active tab and ignores a foreign id; `renameTab` ignores unknown ids and an empty title                | [unit]         | `tabsSlice.test.ts > Stage 11: reorder and rename` (4 cases)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | PASS      |
| Item 1: the tab row is draggable, a drop calls the notebook, Enter commits, Escape cancels, blur commits, order untouched          | [unit]         | `TabButton.test.tsx > Stage 11 tab gestures` (7 cases)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | PASS      |
| Item 1: dragging a tab onto another tab really reorders the running notebook (and the tab in front stays in front)                 | [e2e]          | `tabs.e2e.ts > dragging a tab onto another tab moves it to that slot`, `> a drop on the tab itself changes nothing`                                                                                                                                                                                                                                                                                                                                                                                                                              | PASS      |
| Item 1: double-click renames that tab only; Escape and an empty title keep the old one                                             | [e2e]          | `tabs.e2e.ts > a double-click renames one tab and leaves the other titles alone`, `> Escape cancels the rename, and an empty title keeps the old one`                                                                                                                                                                                                                                                                                                                                                                                            | PASS      |
| Item 1: titles are stored on the tab only - no config file mentions the new title, and a restart has no tabs                       | [e2e]          | `tabs.e2e.ts > the new title is on the tab only: nothing on disk mentions it`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | PASS      |
| Item 1: one screenshot of the inline rename field                                                                                  | [agent]        | `(screenshot withheld from the public repo: it showed the developer's local username and hostname)` (taken in the spec while the field is open)                                                                                                                                                                                                                                                                                                                                                                                                  | PASS      |
| Item 2: the backup is one JSON object with header + three arrays in the on-disk record shape                                       | [unit] + [e2e] | `export::tests::a_backup_is_one_json_object_with_the_three_arrays`; e2e `backup.e2e.ts > Back up library writes one JSON file with all three collections` (also reads the 5/1/2 counts from the sandbox fixture)                                                                                                                                                                                                                                                                                                                                 | PASS      |
| Item 2: it lands in `<hostsFolder>/backups/` with folder 0700 and file 0600                                                        | [unit] + [e2e] | `export::tests::a_backup_lands_in_the_backups_folder_with_private_modes`; e2e same test asserts both modes and that the folder is under the config dir                                                                                                                                                                                                                                                                                                                                                                                           | PASS      |
| Item 2: an existing target is refused and keeps its bytes                                                                          | [unit] + [e2e] | `export::tests::an_existing_target_is_refused_and_left_alone`; e2e `> a file the user owns at the chosen path is never overwritten` (invokes the real command, asserts `code: exists`)                                                                                                                                                                                                                                                                                                                                                           | PASS      |
| Item 2: with encryption on the copy is armored, named `.json.gpg`, and decrypts back to the records                                | [unit]         | `export::tests::an_encrypted_backup_is_armored_and_named_with_the_gpg_suffix`, `> a_chosen_path_gets_the_gpg_suffix_when_encryption_is_on`                                                                                                                                                                                                                                                                                                                                                                                                       | PASS      |
| Item 2: a locked library is refused, with no half-written backup                                                                   | [unit] + [e2e] | `export::tests::an_encrypted_library_without_the_passphrase_is_not_backed_up`; e2e `> an encrypted library refuses the backup until it is unlocked`                                                                                                                                                                                                                                                                                                                                                                                              | PASS      |
| Item 2: the toast counts and names the file; a failure is logged and toasted; the double-click guard holds                         | [unit]         | `backup.test.ts > backupLibrary (Stage 11, P2)` (6 cases)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | PASS      |
| Item 2: `Back up library` calls `export_library` with `path: null`; a cancelled dialog exports nothing                             | [unit]         | `backupActions.test.ts > header menu library-file actions (Stage 11)` (6 cases)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | PASS      |
| Item 2: a second backup makes a second file and the library files stay as they were                                                | [e2e]          | `backup.e2e.ts > a second backup makes a second file and leaves the library files alone`                                                                                                                                                                                                                                                                                                                                                                                                                                                         | PASS      |
| Item 2: `Lock library` is disabled while encryption is off, the backup items are enabled                                           | [e2e]          | `backup.e2e.ts > Lock library is off-limits while encryption is off, and Back up is offered`                                                                                                                                                                                                                                                                                                                                                                                                                                                     | PASS      |
| Item 2: the native save dialog ("Export library…")                                                                                 | [human]        | `docs/MANUAL_CHECKS.md` Stage 11 - a native dialog cannot be driven by the harness; only its cancel path is unit-proven                                                                                                                                                                                                                                                                                                                                                                                                                          | OPEN      |
| Item 3: `restoreLocalhost` defaults off, parses, survives a round trip, and a pre-Stage-11 file still parses                       | [unit]         | `settings::tests::restore_localhost_defaults_off_and_survives_a_round_trip` (plus `defaults_round_trip`)                                                                                                                                                                                                                                                                                                                                                                                                                                         | PASS      |
| Item 3: the quit flow lists Localhost only when the setting is on, and writes nothing when `restoreHosts` is off                   | [unit]         | `quitFlow.test.ts > lists Localhost too when restoreLocalhost is on`, `> keeps Localhost out when restoreHosts is off, whatever the new flag says`                                                                                                                                                                                                                                                                                                                                                                                               | PASS      |
| Item 3: `restorePlan` restores Localhost only with `includeLocal`, keeping order and counts                                        | [unit]         | `restore.test.ts > restores Localhost when the Stage 11 setting is on`, `> never restores Localhost while the setting is off`                                                                                                                                                                                                                                                                                                                                                                                                                    | PASS      |
| Item 3: the Preferences switch is disabled with the tooltip until Restore hosts is on                                              | [unit] + [e2e] | `preferences.test.tsx > Restore local shells is off until Restore hosts is on`; e2e `restore-local.e2e.ts > Restore local shells is disabled until Restore hosts is on`                                                                                                                                                                                                                                                                                                                                                                          | PASS      |
| Item 3: the round trip through settings.json really reopens two working local shells                                               | [e2e]          | `restore-local.e2e.ts > with the setting on, the Localhost tabs of the last run come back` (asserts `openedHosts`, the reload, two prompts, and the cleared list)                                                                                                                                                                                                                                                                                                                                                                                | PASS      |
| Item 3: with the setting off, a Localhost-only run restores nothing                                                                | [e2e]          | `restore-local.e2e.ts > with the setting off, a Localhost-only run restores nothing`                                                                                                                                                                                                                                                                                                                                                                                                                                                             | PASS      |
| Item 4 (Lock now): Rust drops the passphrase, the unlock modal returns, a backup and a save then refuse, and unlocking works again | [e2e]          | `backup.e2e.ts > Lock library drops the passphrase, and the unlock modal comes back`                                                                                                                                                                                                                                                                                                                                                                                                                                                             | PASS      |
| Item 4 (Lock now): the action's failure path leaves the library unlocked                                                           | [unit]         | `cryptoActions.test.ts > lockLibrary (Stage 11, Stage 10 open question 1)` (2 cases), `backupActions.test.ts > a failed lock keeps the library unlocked`                                                                                                                                                                                                                                                                                                                                                                                         | PASS      |
| No Stage 1-10 acceptance regresses (milestone: re-run the e2e suite)                                                               | [agent]        | `Spec Files: 18 passed, 18 total … 89 passing, 0 failing` in the gate above                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | PASS      |
| Every rule 3 command still passes                                                                                                  | [agent]        | the gate block above: `full verify: all OK`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | PASS      |
| Env-sanitize grep (no new subprocess)                                                                                              | [agent]        | `grep -rn "Command::new\|CommandBuilder::new" src-tauri/src` still gives only `gpg.rs:103` (then `sanitize_std_command` at :104), `file_browser.rs:125` (:126), `pty_manager.rs:78` (`sanitize_pty_command` at :79), plus `commands/system.rs` using `env_sanitize::clean_env()`; Stage 11 added no subprocess and no env mutation                                                                                                                                                                                                               | PASS      |
| Screenshots (budget 1 per item; 2 taken)                                                                                           | [agent]        | `(screenshot withheld from the public repo: it showed the developer's local username and hostname)` - the first of three Localhost tabs shows a focused text field with "Localhost" in it while the other two tabs and the shell prompt are behind it. `docs/screenshots/stage_11/header-menu.png` - the app menu lists Preferences, Import from EasySSH, Back up library, Export library…, Lock library, About, Quit with the "Encrypted the library" toast below. No third shot: the restore switch and the backup file are asserted by tests. | PASS      |

## 10. Known issues / TODOs

- **A real mouse drag is unverified.** The specs dispatch HTML5 drag events
  because a W3C pointer drag starts no HTML5 drag in this driver. The logic is
  unit-proven; the affordance (does the dashed outline read as "drop here?") is
  a [human] item.
- **Backups accumulate.** `backups/` has no rotation and no size cap; 20
  backups of a big library is real megabytes. Stage 12 should keep the last N
  or offer a "remove old backups" action - it was not in scope here.
- **A backup cannot be restored yet.** Nothing reads the backup document back
  in. Its shape is deliberate (§8.3) so a later "Restore from a backup" is a
  few lines; until then the file is a hand-recoverable copy.
- **Backup names have second resolution.** Two presses in the same second make
  the second one fail with "already exists" (the e2e waits 1.1 s). Harmless,
  but a millisecond suffix or a `-2` suffix would be friendlier.
- **"Lock library" clears the passphrase from Rust only.** The library is still
  in the webview's memory and the open terminals keep working, so it is a
  "make me re-authenticate before the next write" action, not a screen lock. A
  true lock would also drop `hosts`/`accounts`/`bookmarks` from the store and
  close the notebooks - a bigger change, and not what §12.1 asked for.
- **No idle auto-lock** - rejected deliberately (§5); recorded in case the owner
  wants it later.
- **`docs/screenshots/stage_01..07` PNGs changed again** because the milestone
  run re-took them (they are regenerated by the specs, byte-for-byte stable
  except for window-position noise). Committed with this stage, as in Stage 10.
- Check on a real device (docs/MANUAL_CHECKS.md, Stage 11): the mouse drag, the
  rename focus behaviour under a real double-click, the native save dialog,
  a 2000-host backup, and `Restore local shells too` with fish/zsh as `$SHELL`.

## 11. Instructions for the next stage

- First files to open: `src-tauri/src/export.rs` (+ `export/tests.rs`),
  `src-tauri/src/commands/export.rs`, `src/lib/backup.ts` / `backupActions.ts`,
  `src/components/Workspace/TabButton.tsx`, `src/lib/tabReorder.ts`,
  `src/lib/restore.ts` + `src/lib/quitFlow.ts`, `src/components/HeaderBar.tsx`,
  the three new specs, and `docs/MANUAL_CHECKS.md` Stage 11.
- Pitfalls noticed:
  - `export::export` takes `now_secs` as an argument on purpose - a test needs a
    fixed stamp; do not replace it with a `SystemTime::now()` call inside.
  - `storage::report_from` is the entry point that knows about `locked`. Any new
    library-reading command should use it, not `fs::read`, or it will hand out
    ciphertext or an empty list.
  - The rename field's 300 ms blur guard exists because the newly active pane's
    xterm grabs focus. If Stage 12 changes when a pane focuses its terminal,
    re-run `tabs.e2e.ts` - the rename tests are what notice it.
  - React's `onDoubleClick` in this WebKit build needs a dispatched
    `dblclick` with `view: window` and `detail: 2` (see `startRename` in
    `tabs.e2e.ts`).
  - `dragTab` in the spec must pause between `dragstart` and `drop`: the
    notebook's highlight is React state and the drop is read from a ref.
  - `menuItemDisabled`/`menuItemClick` match on the item's text, so a label
    change in `strings.ts` must be matched in the specs (the ellipsis in
    `Export library…` is `\u2026`, not three dots).
  - Milestone runs need `docker start fastssh-sshd`; stop it afterwards, restore
    `~/fastssh-testenv/ssh/config` with `tools/make_fixtures.sh`, delete
    `ssh/config.backup*`, and optionally clear `~/fastssh-testenv/config/backups`.
  - Stage 12 §12.2 wants the read-only-folder path tested live again (`chmod 500
~/fastssh-testenv/config`); the backups folder inherits the 0700 creation in
    `export::backup_dir`, so a read-only hosts folder makes the backup fail with
    an `io` toast - that is the expected behaviour to record.

## 12. Open questions for the human

1. **Backup rotation.** Keep the last N backups automatically (N = 10?), or
   leave the folder alone and let the user prune it? Stage 11 writes one file
   per press and never deletes.
   - leave the folder alone and let the user prune it
2. **Restore from a backup.** Should Stage 12 add "Restore from a backup file…"
   (the document is already shaped for it), or is FastSSH's library folder
   enough? Nothing reads a backup yet.
   - FastSSH's library folder enough.
3. **How far should "Lock library" go?** Today it drops the passphrase from Rust
   and shows the unlock modal; the library stays visible and terminals stay
   open. A stricter lock would clear the store and close the notebooks.
   - pick the best option
4. **Stage 11 items not built** (the owner named only the three above): quick
   connect bar, keychain passphrase storage, host-key-changed "Copy command",
   virtualized host list, broadcast input, run-on-connect bookmark, session
   logging. Say which of these you want in Stage 12's margin, or none.
   - none.
