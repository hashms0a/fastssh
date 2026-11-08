# HANDOFF_STAGE_09 — Complete. Enabling "Sync SSH config" backs up the config, imports its concrete Host blocks into the `SSHConfig` group, and from then on every host save rebuilds the file atomically while the user's global, wildcard, `Match` and `Include` blocks survive verbatim. Connections run in sync mode (`ssh -F <dir>/config <name>`), and the sandbox `ssh_dir` is what every path resolves to.

Date: 2026-11-08
Status: Complete
Next stage: 10 — GPG encryption + EasySSH import

## 1. Summary

Stage 9 tasks 9.1-9.9 are done. `ssh_config.rs` parses the file into blocks
(`Preamble | Host(patterns) | Match`) keeping the raw lines verbatim, with
case-insensitive keywords, `Key Value` and `Key=Value`, quoted values and
tolerated CRLF (9.1). `ssh_config/import.rs` produces one host per concrete
pattern - `HostName/Port/User/IdentityFile` mapped, group `SSHConfig`,
`ssh_config` = the block with its Host line rewritten to the single pattern,
existing names skipped, returning `(new_hosts, skipped)` (9.2).
`ssh_config/export.rs` writes the preamble verbatim, then a marked managed
section with one normalised block per non-local host, then every block the
library does not own (wildcard, negated, `Match`, `Include`) in original order
(9.3). `ssh_config_sync.rs` does the file work: backup to `config.backup`, or
`config.backup.<ts>` when that name is taken (9.4), symlink-resolved atomic
0600 write with a 0700 dir (9.5), and the commands `ssh_config_info`,
`enable_ssh_config_sync`, `disable_ssh_config_sync`, plus `save_hosts`, which
now exports when the flag is on and returns an export failure as a warning
instead of failing the save (9.6). Preferences' Sync switch is live: it shows a
confirm dialog naming the config and the backup path, then toasts
`Imported N hosts (M skipped)` (9.7). Sync-mode connections were already built
in Stage 5 and are now proven end to end (9.8).

## 2. Environment (unchanged since Stage 0A)

Ubuntu 24.04 / GNOME / Wayland + XWayland, x86_64, screen 2560x1440.
Node v26.13.0, npm 11.20.0, rustc 1.99.1, cargo 1.99.1,
`XDG_CURRENT_DESKTOP=ubuntu:GNOME`, `XDG_SESSION_TYPE=wayland`, tauri 2.12.5 /
tauri-cli 2.12.4, OpenSSH 10.2p1 (`ssh -F … -G` used by the spec).
**No package was installed and no sudo was used in this session.**
Machine changes: none.
Session start: `HEAD = 20f1342 "Stage 08: preferences modal, session restore,
quit flow"`. The only working-tree change was `docs/handoff/HANDOFF_STAGE_08.md`
with the owner's answers (license = MIT; quit-with-failing-settings "see what is
the best option" - see §12). No Stage 8 rebuild or re-test: its handoff says
Complete and Stage 9 is not a milestone.
Container `fastssh-sshd`: **started** for this stage (Test Matrix Docker = yes),
**stopped** at the end. Sandbox `~/fastssh-testenv`; the sandbox ssh config was
restored to the pristine fixture afterwards with `tools/make_fixtures.sh`, and
the run's `config.backup*` files were removed.
The owner's `~/.ssh`, `~/.config/easyssh`, `~/.config/fastssh` were not touched
(verify.sh "real files OK", §9).

## 3. Requirements touched by this stage

Other rows keep the status in HANDOFF_STAGE_08 §3.

| Req | Status | What changed here                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R7  | Done   | `ssh_config.rs` + `ssh_config/{import,export}.rs` (parse, import, export), `ssh_config_sync.rs` (backup, symlink-safe atomic write, enable/disable, export-on-save), commands `ssh_config_info` / `enable_ssh_config_sync` / `disable_ssh_config_sync`, live Sync switch with the confirm dialog and the import toast, `SSHConfig` group in the sidebar                                                                                                                                  |
| R9  | Done   | sync mode `ssh <name>` (Stage 5 builder) now proven: with the flag on, `ps` shows `ssh -F <sandbox>/config … web1` and the key login succeeds; the `FASTSSH_SSH_DIR` prefix still applies                                                                                                                                                                                                                                 |
| R1  | Done   | editing a host (db2's port in the spec) triggers the export, so the library stays the source of truth and `ssh -G db2` reports the new port; a host removed from the library loses its block (unit-proven)                                                                                                                                                                                                              |
| R18 | Done   | `prefs-sync-config` is no longer disabled; it runs `enableSync`/`disableSync` (`src/lib/sshConfigSync.ts`, `src/hooks/useSyncToggle.ts`). Encrypt stays disabled for Stage 10                                                                                                                                                                                                                                            |
| R20 | Done   | no new subprocess in this stage: the only `Command::new` / `CommandBuilder::new` remain `file_browser.rs` and `pty_manager.rs`, both behind the sanitizers                                                                                                                                                                                                                                                              |

## 4. Files created / modified

Created

- `src-tauri/src/ssh_config.rs` - block model + parser + the shared line helpers
  (`keyword`, `value_of`, `unquote`, `quote_value`, `field`, `is_concrete`,
  `is_marker`, `existing_names`), 161 lines
- `src-tauri/src/ssh_config/import.rs` (+ `import/tests.rs`) - task 9.2
- `src-tauri/src/ssh_config/export.rs` (+ `export/tests.rs`) - task 9.3
  (`sync_block`, `block_for`, `export`)
- `src-tauri/src/ssh_config/test_support.rs` - the fixture + shared test helpers
- `src-tauri/src/ssh_config_sync.rs` - `config_path`, `read_config`,
  `backup_target`, `backup`, `write_config`, `write_from_library`, `info`,
  `enable`, `save_hosts_and_sync`
- `src-tauri/src/ssh_config_sync/{tests,enable_tests,test_env}.rs` - 9 cargo
  tests over temp dirs
- `src-tauri/src/commands/sync.rs` - the three commands (handlers only parse,
  call, map errors)
- `src-tauri/tests/fixtures/ssh_config_sample` - copy of the sandbox fixture
- `src/lib/sshConfigSync.ts` (+ `.test.ts`) - the enable/disable flow as a pure
  function with injected deps (10 tests)
- `src/hooks/useSyncToggle.ts` - store + IPC wiring of that flow, plus the
  re-render tick a controlled checkbox needs
- `e2e/specs/sshconfig.e2e.ts` - 3 tests
- `docs/MANUAL_CHECKS.md` - the Stage 9 `[human]` items

Modified

- `src-tauri/src/lib.rs` - `pub mod ssh_config; pub mod ssh_config_sync;` + the
  three commands
- `src-tauri/src/commands/library.rs` - `save_hosts` now returns
  `Result<Option<String>, AppError>` via `ssh_config_sync::save_hosts_and_sync`;
  `blocking()` became `pub(crate)` for `commands/sync.rs`
- `src-tauri/src/commands/mod.rs` - `pub mod sync;`
- `src/lib/ipc.ts` - `sshConfigInfo`, `enableSshConfigSync`,
  `disableSshConfigSync`, `SyncInfo`, `SyncReport`; `saveHosts` now resolves
  `string | null`
- `src/store/slices/librarySlice.ts` - `makeSaver` passes `get` to the saver, and
  the hosts saver toasts the export warning (task 9.6)
- `src/lib/strings.ts` - `syncHint`, `syncConfirmTitle`, `syncConfirmMessage`,
  `syncImported`, `syncStopped` (replaces `syncSoonHint`)
- `src/components/Modals/PreferencesModal.tsx` - the Sync switch live via
  `useSyncToggle` (279 lines)
- `src/components/Modals/ModalHost.tsx` - `z-40` → `z-[60]`, so a dialog raised
  from an overlay is visible (see §8.8)
- `src/test/ipcMock.ts` - mock answers for `ssh_config_info` and
  `enable_ssh_config_sync`
- `src/components/Modals/preferences.test.tsx` - the switch is no longer
  disabled: it asks, enables on OK, stays off on Cancel and on failure
- `e2e/helpers.ts` - `resetSandbox("sshconfig")` now re-runs
  `tools/make_fixtures.sh` and clears `config.backup*`; new `sshConfigPath`,
  `readSshConfig`, `sshConfigDump`, `rowsInGroup`

## 5. Architecture notes

- **Who owns which lines.** The managed section is delimited by two comment
  markers. Everything above it (the preamble) and every block with a wildcard,
  a negated pattern, or a `Match` line belongs to the user and is copied
  verbatim. A concrete Host block of the old file is dropped, because the
  library owns it after the import - that is what makes "delete a host in
  FastSSH" remove it from the file.
- **Order matters for ssh semantics.** ssh takes the first match, so the managed
  hosts are written *before* `Host *` (plan 9.3 rationale).
- **The block the editor shows is the block that is written.**
  `ssh_config/export.rs::sync_block` mirrors `src/lib/sshConfigBlock.ts`:
  managed lines first in a fixed order (`Host, HostName, User, Port,
  IdentityFile`), then the tunnel forwards, then the user's own lines in order.
- **An export failure must not lose a save.** `save_hosts_and_sync` saves the
  library first and returns the export error as `Some(message)`; the hosts
  saver turns it into an error toast naming the file and the OS error.
- **Enable is all-or-nothing on the flag.** Rust runs backup → import → save →
  export; only a successful run sets `syncSshConfig` in the in-memory settings,
  and the frontend persists the flag afterwards. A failed enable leaves sync
  off, so the next save does not half-sync.
- **Backup never overwrites a pristine original.** `backup_target` returns
  `config.backup`, else `config.backup.<ts>` (incrementing while that name is
  taken, so two enables in the same second still keep both).
- **Symlink-safe write.** `write_config` canonicalizes `<ssh_dir>/config` and
  atomically writes the resolved target with mode 0600, so a dotfile-manager
  symlink stays a symlink.
- **Only the sandbox is ever written.** Everything resolves through
  `paths::ssh_dir()`, which honours `FASTSSH_SSH_DIR`; lib.rs logs the three
  dirs at info level at startup, and the smoke run shows the sandbox (§9).
- **Import never reads a password.** ssh_config has no password field, and the
  exported file is asserted not to contain the fixture password.

## 6. Data / settings schema

Unchanged: `schemaVersion: 1`, no new `AppSettings` field; `syncSshConfig`
becomes meaningful. On-disk effects of this stage:

- `<ssh_dir>/config` - preamble, managed section (marked), then the user's
  wildcard/`Match`/`Include` blocks. Mode 0600, written atomically.
- `<ssh_dir>/config.backup` / `config.backup.<unix-ts>` - copies of the file as
  it was when sync was enabled, with the original mode.
- A host imported from the config carries `group: "SSHConfig"` and its own
  `ssh_config` block; a forward already present (`LocalForward 18080
  localhost:80`) is stored as `tunnels: "-L 18080:localhost:80"` (see §8.2).
- `save_hosts` IPC shape: `() -> Option<String>` (a warning) instead of `()`.

## 7. Dependencies added or changed in this stage

- npm: none. cargo: none (`uuid`, `tempfile`, `serde` were already there).
- No capability change: the three new commands are plain app commands, and no
  new JS plugin API is used.

## 8. Deviations from the plan and why

1. **The file is not regenerated from scratch** (spec 8.3 does). The preamble
   and every non-concrete block are kept verbatim after the managed section.
   This is the deviation the plan itself records in task 9.3; without it a
   user's `Host *`, `Match` and `Include` settings would be destroyed.
2. **Import also maps existing forwards into `Host.tunnels`.** Task 9.2 lists
   only host/port/user/identity. Because the export rebuilds the forward lines
   from `tunnels`, a config with `LocalForward` would otherwise lose it on the
   first save. Files: `ssh_config/import.rs`, test
   `an_existing_forward_becomes_a_tunnel_so_it_survives_the_export`.
3. **`skipped` counts names that already exist**, not the wildcard/negated
   patterns (those simply produce no host). The toast reads
   `Imported 5 hosts (0 skipped)` on the fixture; enabling twice gives
   `Imported 0 hosts (5 skipped)` (unit-proven).
4. **Marker comments are stripped from a stored block and never duplicated.**
   `rewrite_host_line` drops them, and `export` filters them out of every
   preserved chunk, so `export → parse → import → export` is byte-stable.
5. **`ensure_ssh_dir` does not chmod an existing dir** (it only creates a
   missing one as 0700). Chmodding would silently undo a deliberate read-only
   `~/.ssh`, which is exactly the failure path task 9.6 must report.
6. **`save_hosts` returns a warning string** instead of `()`. The plan says the
   hosts save still succeeds and the UI shows a toast, so the warning has to
   travel to the frontend. Files: `commands/library.rs`, `src/lib/ipc.ts`,
   `librarySlice.ts` (`makeSaver` now hands the saver `get`).
7. **The checkbox is re-rendered by a tick.** A controlled checkbox only gets
   its DOM value reconciled on the next render, so a Cancelled or failed enable
   would stay visually ticked. `useSyncToggle` bumps a counter used as the
   `key`. Files: `useSyncToggle.ts`, `PreferencesModal.tsx`.
8. **`ModalHost` moved from `z-40` to `z-[60]`.** Stage 9 raises a confirm
   dialog *from* the Preferences overlay (`z-50`), so with the old order the
   dialog sat behind it - the issue Stage 8 recorded under "Known issues". One
   line, and the Stage 8 note is now resolved.
9. **`resetSandbox("sshconfig")` re-runs `tools/make_fixtures.sh`** and removes
   `config.backup*`, as the acceptance bullet describes; the previous version
   only copied the config into the (unused) `config/ssh_config` file.
10. **Module layout** (rule 7): the parser, the importer and the generator live
    in `ssh_config.rs` + `ssh_config/{import,export}.rs`, and the sync tests in
    `ssh_config_sync/{tests,enable_tests,test_env}.rs`. Everything stays under
    300 lines; `ssh_config.rs` re-exports `import`, `export`, `sync_block`,
    `block_for` so callers use `ssh_config::parse/import/export`.
11. **`Include` files are not followed for import** - the limitation the plan's
    notes ask for. Hosts inside them keep working through the preserved
    `Include` line; listed in `docs/MANUAL_CHECKS.md`.
12. **Enabling sync writes every library host**, not only the imported ones
    (task 9.3: "one block per non-local host"). Localhost is filtered.

## 9. Verification

`tools/verify.sh full sshconfig` (stage gate, one run after all tasks):

```
prettier       OK   2s      debug build    OK   10s
eslint         OK   2s      smoke          OK   8s
tsc            OK   3s      e2e sshconfig  OK   11s
vitest         OK   6s      full verify:   all OK
cargo fmt      OK   0s      real files     OK   0s
clippy         OK   0s
cargo test     OK   1s
```

After the last change (`ModalHost` z-index, `useSyncToggle` extraction) the
debug binary was rebuilt and re-run: `e2e/specs/sshconfig.e2e.ts` 3 passing,
and `e2e/specs/preferences.e2e.ts` 6 passing (its code is covered by the
switch and the dialog layering, so it was re-run once).

Test counts: vitest 287 passed / 39 files (was 275/38), cargo 110 passed
(was 83; +27 from this stage), e2e sshconfig 3 tests.

Acceptance, one row per bullet:

| Bullet                                                                                                                            | Tag   | Proof                                                                                                                                                                                                                                                                                                                                                                       | PASS |
| --------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| The 9.9 Rust tests: parse, import, export, round trip, delete, backup, symlink, read-only                                         | unit  | `ssh_config/tests.rs` (4), `ssh_config/import/tests.rs` (4), `ssh_config/export/tests.rs` (9), `ssh_config_sync/tests.rs` (4), `ssh_config_sync/enable_tests.rs` (5) - 27 new cargo tests, all passing                                                                                                                                                                       | PASS |
| `config.backup` equals the original byte-for-byte                                                                                  | unit  | `ssh_config_sync::tests::the_backup_equals_the_original_byte_for_byte_and_keeps_its_mode` (+ `a_missing_config_makes_no_backup`) and `enable_tests::enable_backs_up_imports_saves_the_library_and_exports` compares the enable's backup with the fixture bytes                                                                                                              | PASS |
| A second enable writes `config.backup.<ts>` and leaves `config.backup` unchanged                                                   | unit  | `ssh_config_sync::tests::a_second_backup_goes_to_a_timestamped_file_and_leaves_the_first_alone`; `enable_tests::enable_skips_names_that_already_exist_and_reimporting_adds_nothing` proves the second enable imports nothing                                                                                                                                               | PASS |
| Changing db2's port gives `Port 2200`; preamble, `Match`, `Include` and `Host *` survive                                           | unit  | `export/tests.rs::changing_a_port_rewrites_only_that_block` + `export_keeps_the_preamble_the_match_block_the_include_line_and_host_star`; e2e proves it through ssh itself                                                                                                                                                                                                  | PASS |
| Deleting db10 removes its block                                                                                                     | unit  | `export/tests.rs::deleting_a_host_removes_its_block` (also asserts `10.0.0.10` is gone and db2 stays)                                                                                                                                                                                                                                                                       | PASS |
| A read-only config fails the export while the hosts save still succeeds (warning returned)                                         | unit  | `enable_tests::a_read_only_config_fails_the_export_but_the_hosts_save_still_succeeds` (mode 0500 ssh dir: `Ok(Some(warning))`, warning names the path and "Permission denied", hosts.json written, config unchanged); `with_sync_off_a_save_leaves_the_config_alone` proves disable leaves the file alone                                                                   | PASS |
| A symlinked config is still a symlink after an export                                                                              | unit  | `ssh_config_sync::tests::a_symlinked_config_is_still_a_symlink_after_an_export` (symlink metadata checked, target holds the managed section, mode 0600)                                                                                                                                                                                                                     | PASS |
| Enable Sync in Preferences and confirm: the toast counts are right and the `SSHConfig` group lists web1, web-alias, db10, db2, bastion | e2e  | `sshconfig.e2e.ts` "enabling Sync asks first, then imports the config hosts and writes the managed section" - confirm text names `<sandbox>/ssh/config` and `config.backup`, toast `Imported 5 hosts (0 skipped)`, `rowsInGroup("SSHConfig")` = the five names, and the file keeps preamble / `!negated *.corp` / `Match` / `Include` / `Host *` with the managed section before `Host *` | PASS |
| Change db2's port to 2200 in the editor: `ssh -F <sandbox>/config -G db2` prints `port 2200`                                       | e2e   | `sshconfig.e2e.ts` "editing db2's port rewrites its block, and ssh -G db2 reports port 2200" (`sshConfigDump("db2")` matches `^port 2200$`, `web1` keeps `port 2222`)                                                                                                                                                                                                      | PASS |
| Connect web1 (sync mode): `ps` shows `ssh -F` and `web1`, key login succeeds                                                        | e2e   | `sshconfig.e2e.ts` "connecting web1 runs ssh -F <sandbox>/config web1 and logs in with the key" (`expectPrompt(tab, "keyuser")`, `ps -eo args` lines contain `ssh -F`, `web1`, the sandbox path and `UserKnownHostsFile`, and no `-p 2222`)                                                                                                                                 | PASS |
| The info log line at startup shows that `paths::ssh_dir()` is the sandbox                                                           | agent | `timeout 6 ./tools/dev-sandbox.sh debug` (and verify.sh's smoke run) → `[fastssh_lib][INFO] config_dir="/home/dev/fastssh-testenv/config" ssh_dir="/home/dev/fastssh-testenv/ssh" legacy_dir="/home/dev/fastssh-testenv/legacy"`                                                                     | PASS |
| The real-files guard passes (the owner's `~/.ssh/config` untouched)                                                                | agent | verify.sh `real files OK`, comparing `~/.ssh/config`, `~/.ssh/known_hosts`, `~/.config/easyssh/*`, `~/.config/fastssh/*` against `~/fastssh-testenv/realfiles.baseline`                                                                                                                                                                                                    | PASS |

Screenshot budget: 0 of 0 (Test Matrix Shots = 0). Nothing new was screenshotted;
the file contents are asserted by reading them in the spec.

- Env-sanitize grep: `Command::new` once outside `env_sanitize.rs`
  (`file_browser.rs:125`) and `CommandBuilder::new` once (`pty_manager.rs:78`);
  Stage 9 adds no child process (`fs::copy`, `atomic_write`, symlink resolve).
- `[unit]` read-only path is covered with a temp dir at mode 0500; no chmod was
  done on the sandbox (Test Matrix Perm = unit).

## 10. Known issues / TODOs

- **A host whose name already exists is skipped on enable**, so a config block
  with the same name as an existing host is not imported and its lines are then
  dropped from the file by the export (the library owns the name). Impact: a
  hand-written block can disappear. Suggested fix in Stage 11/12: ask per name,
  or keep non-concrete-looking blocks that the user edited by hand.
- **`Include` files are not imported** (plan limitation). Their hosts still work
  through the preserved `Include` line, but FastSSH does not list them.
- **The managed section holds every library host**, including hosts the user
  never wants in `~/.ssh/config` (e.g. the legacy fixture's `Сервер-1`). EasySSH
  behaved the same way; a per-host "include in ssh config" flag would be a
  Stage 11 item.
- **Enabling sync writes the config before the settings file says so.** Rust
  sets the in-memory flag and exports; `syncSshConfig` reaches `settings.json`
  through the debounced settings save. If the app is killed in that window the
  config is synced while settings still say off - the next save re-exports the
  same content, so the file is not wrong, only the flag is stale.
- **`backup_target` previews the timestamp in the confirm dialog** and re-checks
  it when enabling, so the name in the dialog can differ by a second from the
  file actually written if the user waits across a second boundary. Harmless.
- Carried from Stage 8: no `LICENSE` file (owner chose MIT - see §12); the
  `TextRow` commit-on-blur feel; no `dolphin` here, so the KDE file-manager
  fallback stays unit-proven only.

Check on a real device (`[human]`, all in `docs/MANUAL_CHECKS.md`)

- Enabling Sync against your **real** `~/.ssh/config` (approval required):
  backup made, preamble before the managed section, wildcard/`Match`/`Include`
  kept, `ssh <name>` still connects, deleting a host removes its block.
- A symlinked `~/.ssh/config` (dotfiles repo) survives enable + a host save.
- Hosts living inside an `Include` file still connect and are not duplicated.
- Sync mode against a real server with a zsh/fish prompt (R11 heuristics).
- A read-only `~/.ssh/config`: the toast wording when the export fails.
- Turning sync back off leaves the file editable by hand.

## 11. Instructions for the next stage (10: GPG encryption + EasySSH import)

- First files to open: `src-tauri/src/storage.rs` (`report_from` sets
  `locked: false` and `legacy_available`; `read_array`/`atomic_write` are the
  hooks for `*.json.gpg`), `src/lib/ipc.ts` + `src/test/ipcMock.ts` (the
  `LoadReport` shape), `src/main.tsx` (hydrate before the first frame - an
  encrypted library needs the passphrase first), `src/store/slices/librarySlice.ts`
  (`locked`), `src/components/Modals/ModalHost.tsx` + `modalSlice` (the dialog
  queue - add `GpgPasswordModal` as a dialog kind), `src-tauri/src/lib.rs`
  (`AppState.passphrase` exists but is unused; `commands/crypto.rs` does not
  exist yet), `src-tauri/src/hosts_folder.rs` (`LIBRARY_FILES` and the `.gpg`
  name handling already anticipate this stage).
- Pitfalls noticed:
  - Test Matrix for Stage 10: Docker = **no**, Spec = `gpg`, **ALL = yes**
    (milestone: `E2E_ALL=1 tools/verify.sh full`), Shots = 1. Stop
    `fastssh-sshd` (already stopped here) and do not start it.
  - `~/fastssh-testenv/bad/hosts.json.gpg` is the "unsupported/corrupt gpg"
    fixture, and `bad/settings.json` the bad-settings one; `legacy/` holds the
    EasySSH files for R5 - import must read `FASTSSH_LEGACY_DIR`, never
    `~/.config/easyssh`.
  - The gpg flags the plan fixes: `--batch --yes --quiet --pinentry-mode loopback
    --no-symkey-cache --passphrase-fd 0`, passphrase over stdin only. Any new
    subprocess must go through `env_sanitize::sanitize_std_command`.
  - `e2e/helpers.ts` is now ~500 lines of shared spec helpers (rule 7 targets
    `src` modules; consider splitting it in Stage 12).
  - `commands/library.rs::blocking` is the pattern for blocking file I/O; keep
    handlers thin.
  - `preferences.test.tsx` asserts `prefs-encrypt` is disabled - update it when
    the Encrypt toggle lands, exactly as Stage 9 did for Sync.
  - The milestone run re-took every earlier spec's screenshots in Stage 8, so
    expect `docs/screenshots/stage_*/…png` to show as modified again.

## 12. Open questions for the human

- Stage 8 asked which license to ship; the owner answered **MIT License** in
  `HANDOFF_STAGE_08.md`. Nothing to do in Stage 9 (rule 2), so Stage 12 should
  add `LICENSE` (MIT) and the `license = "MIT"` key in `Cargo.toml`, and keep the
  About dialog's line in sync.
- Stage 8 also asked whether a quit whose settings write failed should confirm
  before quitting ("see what is the best option"). My recommendation, unchanged
  by Stage 9: **keep toast + quit**. A confirm dialog can be unanswered while
  the window must close, and a read-only config dir would then trap the user in
  a window they cannot dismiss; the toast names the file and the OS error, and
  the data that could be written is written. If you want a confirm anyway, the
  place for it is `quitFlow`'s `onError`, not `useCloseHandler`.
- Nothing else needs a decision before Stage 10.
