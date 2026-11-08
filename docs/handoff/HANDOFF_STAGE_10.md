# HANDOFF_STAGE_10 — Complete. `Encrypt data` now really encrypts: the three library files become armored `*.json.gpg`, the plain copies are scrubbed and removed, the app asks for the passphrase on the next start, and a file gpg cannot read is renamed aside instead of destroyed. "Import from EasySSH" merges the legacy folder in one click (5 connections, 1 account, 2 bookmarks from the sandbox fixture) without ever writing to `~/.config/easyssh`.

Date: 2026-11-08
Status: Complete
Next stage: 11 — Recommended enhancements (optional, P1 -> P3)

## 1. Summary

Stage 10 tasks 10.1-10.8 are done.

- **10.1** `src-tauri/src/gpg.rs`: `GpgRunner { program, gnupg_home }` with
  `encrypt(plain, pass) -> armored bytes`, `decrypt(path, pass) -> plain bytes`,
  `is_available()` (`gpg --version`) and `prepare(mode, path, pass, data) ->
(Command, stdin_bytes)`. Flags are fixed in `BASE_ARGS`: `--batch --yes
--quiet --pinentry-mode loopback --no-symkey-cache --passphrase-fd 0`. The
  passphrase is written to the child's **stdin only**, so it is in neither argv
  nor the environment; a passphrase containing `\n`/`\r` is rejected before
  spawning (it would desync the stdin protocol). `GNUPGHOME` is added **after**
  `sanitize_std_command`, so tests can point gpg at a throwaway dir.
  `GpgError { NotInstalled, WrongPassphrase, BadPassphraseChars, Failed }` maps
  gpg's exit code + stderr to codes the frontend can branch on.
- **10.2** `storage` + `crypto.rs`: writes go through `crypto::write_file`,
  which writes `<name>.json.gpg` atomically when `encryptData` is on and the
  passphrase is held, then `scrub_and_remove` (zero the bytes, fsync, unlink)
  the plain file; a save with the flag on and no passphrase is `AppError`
  `locked`. `report_from` returns `locked: true` with empty lists when a
  `*.json.gpg` exists and no passphrase is held - that is what makes the UI
  show the unlock modal.
- **10.3** Commands `crypto_info`, `unlock_library`, `set_encryption`,
  `start_empty_library` in `src-tauri/src/commands/crypto.rs`; the file work is
  in `crypto.rs`: `enable` encrypts + **verifies each file by decrypting it and
  comparing bytes before** removing any plain copy (and unlinks the new `.gpg`
  files if a verification fails), `disable` decrypts all three first
  (all-or-nothing), writes and verifies the plain files, then scrubs the
  `.gpg` files. `unlock` stores the passphrase in `AppState` only after it
  worked. `start_empty` renames every unreadable `*.json.gpg` aside
  (`hosts.json.gpg.corrupt-<ts>`) with its bytes and loads what is left.
- **10.4** `src/components/Modals/GpgPasswordModal.tsx`, three modes (`unlock`,
  `set` with the repeat field + strength hint, `disable`). A wrong passphrase
  shows `Wrong passphrase` and keeps the typed text; an unreadable file shows
  gpg's message naming the file plus a **Start empty** button (confirm first);
  Cancel at unlock asks `Quit FastSSH?` and calls `quit_app` on OK. All the
  branching is in `src/lib/cryptoActions.ts` (`unlockLibrary`, `cancelUnlock`,
  `startEmptyLibrary`, `enableEncryption`, `disableEncryption`) so it is unit
  testable; `src/lib/passphrase.ts` holds the rules (>= 8 chars for enabling,
  no newline, matching confirmation).
- **10.5** Preferences' Encrypt toggle is live (`src/hooks/useEncryptToggle.ts`):
  ticking opens the set modal, unticking opens the confirm-current modal, and
  `crypto_info` disables the switch with the plan's tooltip
  `Install gnupg to enable encryption` when gpg is missing. The Stage 3 hint
  under the password field is suppressed while `encryptData` is on.
- **10.6** `src-tauri/src/legacy_import.rs`: reads
  `<legacy_dir>/{hosts,accounts,bookmarks}.json` with the Stage 1 lenient
  parsers, merges by name (an existing name is skipped and counted, a new name
  gets a fresh id), saves, and returns
  `{hosts_added, accounts_added, bookmarks_added, skipped, warnings}`. It never
  opens the legacy folder for writing (a unit test hashes the folder before and
  after).
- **10.7** Header menu item `Import from EasySSH` (enabled only when
  `LoadReport.legacyAvailable`) and the WelcomeView button
  `Import N connections from EasySSH` when the library is empty and legacy data
  exists. `src/lib/easysshImport.ts` toasts
  `Imported 5 connections, 1 account, 2 bookmarks (N skipped)`, logs every
  warning and puts the first 3 in the toast, and ignores a second click while a
  run is in flight.
- **10.8** Tests: 12 new Rust tests (gpg round trip with a temp `GNUPGHOME`,
  wrong-passphrase right after a good decrypt, the fake `.gpg` fixture, a 5 MB
  payload, the newline rejection, the passphrase not in `get_args()`/`get_envs()`,
  enable/disable/verify-failure, locked load, start empty, import 5/1/2,
  second import 0, legacy folder unchanged) and 4 new vitest files (30 tests).

## 2. Environment (unchanged since Stage 0A)

Ubuntu 24.04 / GNOME / Wayland + XWayland, x86_64, screen 2560x1440.
Node v26.13.0, npm 11.20.0, rustc 1.99.1, cargo 1.99.1, tauri 2.12.5 /
tauri-cli 2.12.4, OpenSSH 10.2p1, **gpg (GnuPG) 2.4.8** (`/usr/bin/gpg`, was
already installed). `XDG_CURRENT_DESKTOP=ubuntu:GNOME`,
`XDG_SESSION_TYPE=wayland`.
**No package was installed and no sudo was used in this session.** Machine
changes: none.
Session start: `HEAD = 35b1cce "Stage 09: two-way ~/.ssh/config sync"`, clean
tree apart from `docs/handoff/HANDOFF_STAGE_09.md` (the owner's answers). No
Stage 9 rebuild or re-test before starting: its handoff says Complete.
Container `fastssh-sshd`: Stage 10's own row is Docker = no, but the milestone
`E2E_ALL=1` run needs the ssh specs, so it was **started** for that run and
**stopped** afterwards. After the run the sandbox ssh config was restored with
`bash tools/make_fixtures.sh` and the run's `ssh/config.backup*` removed.
`~/fastssh-testenv/legacy/` was not written by anything (unit test + spec).
The owner's `~/.ssh`, `~/.config/easyssh`, `~/.config/fastssh` were not touched
(verify.sh "real files OK", §9).

## 3. Requirements touched by this stage

Other rows keep the status in HANDOFF_STAGE_09 §3.

| Req | Status | What changed here                                                                                                                                                                                          |
| --- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R6  | Done   | gpg symmetric encryption of the three library files, passphrase-only-in-Rust, unlock modal, enable/disable with verify, Start empty renames an unreadable file aside, Encrypt toggle + gpg-missing tooltip |
| R5  | Done   | `legacy_import.rs` + `import_easyssh` command, menu item, WelcomeView one-click button, result toast with counts and the first 3 warnings; legacy folder read-only                                         |
| R18 | Done   | `prefs-encrypt` is live (was disabled in Stage 8); it drives the passphrase modal, and the password-field hint disappears when encryption is on                                                            |
| R22 | Done   | WelcomeView offers the import button instead of only "New Connection" when the library is empty and legacy data exists                                                                                     |
| R20 | Done   | one new subprocess (`gpg`); its `Command::new` goes through `sanitize_std_command`, `GNUPGHOME` added after sanitizing, and the passphrase never reaches argv/env                                          |

## 4. Files created / modified

New:

- `src-tauri/src/gpg.rs`, `src-tauri/src/gpg/tests.rs` - runner + tests (created)
- `src-tauri/src/crypto.rs`, `src-tauri/src/crypto/{tests.rs,scrub.rs}` - enable/disable/unlock/start_empty, scrubbing (created)
- `src-tauri/src/legacy_import.rs`, `src-tauri/src/legacy_import/tests.rs` - R5 import (created)
- `src-tauri/src/commands/crypto.rs` - `crypto_info`, `unlock_library`, `set_encryption`, `start_empty_library`, `import_easyssh` (created)
- `src-tauri/tests/fixtures/legacy_{hosts,accounts,bookmarks}.json` - the same shape as the sandbox fixture, for the Rust tests (created)
- `src/lib/passphrase.ts` + `.test.ts`, `src/lib/cryptoActions.ts` + `.test.ts`, `src/lib/easysshImport.ts` + `.test.ts` (created)
- `src/hooks/useEncryptToggle.ts` (created)
- `src/components/Modals/GpgPasswordModal.tsx` + `gpgModal.test.tsx` (created)
- `e2e/specs/gpg.e2e.ts` - 4 tests (created)
- `docs/screenshots/stage_10/unlock-modal.png` (created)

Modified:

- `src-tauri/src/storage.rs`, `src-tauri/src/storage/{library.rs,settings_io.rs,tests.rs}` - crypto-aware read/write, `locked` in `LoadReport`, one locked warning (modified)
- `src-tauri/src/lib.rs` (`AppState.passphrase`, `runner`, new commands), `src-tauri/src/commands/{mod.rs,library.rs,sync.rs}` - crypto context per command (modified)
- `src-tauri/src/hosts_folder.rs`, `src-tauri/src/ssh_config_sync.rs` (+ their tests) - take the crypto context so an encrypted library can be moved/exported (modified)
- `src/lib/ipc.ts`, `src/lib/strings.ts`, `src/lib/errorText.ts` (modified)
- `src/store/slices/{librarySlice.ts,uiSlice.ts}` - `locked`, `passModal`, hydrate keeps the passphrase out of the store (modified)
- `src/App.tsx`, `src/components/Modals/ModalHost.tsx`, `src/components/Modals/PreferencesModal.tsx`, `src/components/Modals/prefsFields.tsx`, `src/components/HeaderBar.tsx`, `src/components/Workspace/WelcomeView.tsx`, `src/components/Toasts.tsx` (modified)
- `src/lib/importActions.ts`, `src/test/ipcMock.ts` (modified)
- `e2e/helpers.ts` - `locked` fixture set, `configNames/configExists/readConfigFile`, `allRowNames`, `typeInto` value check (modified)
- `tools/make_fixtures.sh` - writes `bad/hosts.json.gpg` (modified)
- `docs/MANUAL_CHECKS.md` - Stage 10 [human] items (modified)

## 5. Architecture notes

- **The passphrase is Rust-only.** It is accepted in `unlock_library` /
  `set_encryption` and kept in `AppState.passphrase` (a `Mutex<Option<String>>`
  that is deliberately not serialized). `LoadReport` never carries it,
  `ipc.ts` never caches it, and the frontend store never holds it -
  `gpgModal.test.tsx` asserts the store's JSON does not contain the typed
  passphrase. Every write builds a `LibraryCrypto { runner, passphrase }`
  snapshot (`crypto::ctx`) so a blocking I/O task owns what it needs and a
  poisoned mutex degrades to the value it held.
- **Settings stay single-writer (Stage 8 rule).** `set_encryption` changes only
  the in-memory `AppSettings`; the frontend writes `settings.json`
  (`updateSettings` + `flushSettings` after the IPC resolves), which is why
  `settings.json` is plain and still holds `encryptData`.
- **Encrypted files are never trusted blindly.** `enable` verifies each file by
  decrypting it before deleting anything; `disable` decrypts everything before
  writing anything; a load prefers `<name>.json` over its `.gpg` twin; an
  unreadable file is renamed aside rather than read as empty, because an empty
  list would overwrite the library on the next save.
- **`locked` is a store field, not a modal**: `App.tsx` renders
  `GpgPasswordModal mode="unlock"` whenever `locked` is true, so unlock cannot
  be closed by clicking outside. `passModal` (`"set" | "disable"`) is the
  Preferences-driven mode.
- Toasts hides the load warnings while `locked` (§8.3).
- Import reuses `models::host_from_value`/`account_from_value`/
  `bookmark_from_value` (the Stage 1 lenient parsers), so a legacy record with
  `"port": "abc"` becomes port 22 with a warning, exactly as in §10.8.

## 6. Data / settings schema

Unchanged: `schemaVersion: 1`, no new `AppSettings` field (the full list is in
HANDOFF_STAGE_08 §6). `encryptData` (bool, default `false`) becomes meaningful.
On-disk effects of this stage:

- `<config>/hosts.json.gpg`, `accounts.json.gpg`, `bookmarks.json.gpg` - ASCII
  armored `-----BEGIN PGP MESSAGE-----`, mode 0600, atomic write; their plain
  twins are zeroed + fsynced + unlinked when `encryptData` is on.
- `settings.json` stays plain JSON even with encryption on.
- `<name>.json.gpg.corrupt-<unix-ts>` - an encrypted file gpg could not read,
  renamed aside with its bytes.
- `<legacy_dir>` (`~/.config/easyssh`) is read-only for FastSSH.
- `LoadReport` gained `locked: bool` (already present from Stage 10.2) plus
  `legacyAvailable` / `legacyHosts`.

## 7. Dependencies added or changed in this stage

- npm: none (`package.json`, `package-lock.json` untouched).
- cargo: none (`src-tauri/Cargo.toml`, `Cargo.lock` untouched).
- External binary: `gpg` (GnuPG 2.4.8 here), checked at runtime by
  `crypto_info`; missing -> the Encrypt switch is disabled with a tooltip.

## 8. Deviations from the plan and why

1. **`--passphrase-fd 0` + stdin instead of `--passphrase`** - the plan's
   reference snippet passes the passphrase as an argument, which is readable
   from `/proc`; stdin keeps it out of argv and the environment. Added
   `--no-symkey-cache` and `--pinentry-mode loopback` (needed for a
   non-interactive passphrase on gpg 2.1+, and to prove there is no agent
   cache). `files: src-tauri/src/gpg.rs`.
2. **New e2e fixture set `locked` (only `bad/hosts.json.gpg`) for the Start-empty
   acceptance instead of `resetSandbox('bad')`** - the `bad` set also has the
   corrupt plain files, and `read_file_values` prefers a plain file over its
   `.gpg` twin, so with `bad` the app never tried to decrypt and the unlock
   modal closed with an empty library. `bad` keeps its Stage 1 meaning
   (`warnings.e2e.ts` still passes). `files: e2e/helpers.ts,
e2e/specs/gpg.e2e.ts`.
3. **One locked warning instead of one per encrypted file, and Toasts hides
   warnings while `locked`** - three red "is encrypted" alerts stacked behind
   the unlock modal (seen in the screenshot); the modal already says it.
   `files: src-tauri/src/storage/library.rs, src/components/Toasts.tsx`.
4. **`crypto_info` command** - not in the plan's command list; task 10.5 needs
   "disable the toggle when gpg is unavailable", and the frontend must not run
   `gpg --version` itself. `files: src-tauri/src/commands/crypto.rs`.
5. **`start_empty_library` command + `crypto::start_empty`** - task 10.3's
   "Start empty" needs an IPC entry; the plan only lists `unlock_library` and
   `set_encryption`. `files: src-tauri/src/commands/crypto.rs`.
6. **`storage.rs` split into `storage/library.rs` + `storage/settings_io.rs`**
   (with `storage.rs` keeping the shared helpers) - the file was the largest in
   the crate and Stage 10 doubled its job. Behavior unchanged.
7. **`typeInto` (e2e helper) now checks what landed and falls back to a native
   setter write** - the tauri window is sometimes unfocused (the driver logs
   CDP 404 warnings), and then the keystrokes reach nothing; the passphrase
   tests flaked on that. `files: e2e/helpers.ts`.
8. **Import warnings: first 3 in the toast, all in the log** - as the plan
   says; the toast joins them with `·` so one toast stays readable.
   `files: src/lib/easysshImport.ts, src/lib/strings.ts`.

## 9. Verification

`tools/verify.sh full gpg` (the stage spec):

```
prettier       OK   2s   eslint       OK   2s   tsc          OK   3s
vitest         OK   6s   cargo fmt    OK   0s   clippy       OK   0s
cargo test     OK   9s   real files   OK   0s   debug build  OK   9s
smoke          OK   8s   e2e gpg      OK  23s
full verify: all OK
```

It failed twice before that, both times in `e2e gpg`, and both causes are in §8:
the `bad` fixture shadowed the fake `.gpg` file, and `typeInto` lost keystrokes
when the window was not focused.

Milestone gate `E2E_ALL=1 tools/verify.sh full` (final run, all files as they
are in this handoff):

```
prettier       OK   2s   eslint       OK   3s   tsc          OK   3s
vitest         OK   5s   cargo fmt    OK   1s   clippy       OK   0s
cargo test     OK   9s   real files   OK   0s   debug build  OK  10s
smoke          OK   8s   e2e (all)    OK 278s
full verify: all OK
```

- Test counts: **vitest 324** (was 294; +30 in 4 new files), **cargo test 132**
  (was 120; +12), **e2e 74 passing / 15 spec files, 0 failing** (whole suite,
  `E2E_ALL=1`; `gpg.e2e.ts` contributes 4).

Acceptance (one row per bullet):

| Bullet (short)                                                                                                                                          | Tag            | Proof (test name, or command + output)                                                                                                                                                        | PASS/FAIL |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| gpg round trip with temp GNUPGHOME                                                                                                                      | [unit]         | `gpg::tests::a_round_trip_with_a_temp_gnupghome_returns_the_original_bytes`                                                                                                                   | PASS      |
| Wrong passphrase right after a good decrypt -> WrongPassphrase (no agent cache)                                                                         | [unit]         | `gpg::tests::a_wrong_passphrase_right_after_a_good_decrypt_is_wrong_passphrase`                                                                                                               | PASS      |
| Fake `.gpg` gives a clear error, not a panic                                                                                                            | [unit]         | `gpg::tests::the_fake_gpg_fixture_gives_a_clear_error_and_not_a_panic`, `crypto::tests::the_fake_gpg_file_gives_a_readable_error_naming_the_file`                                             | PASS      |
| 5 MB payload round-trips (no pipe deadlock)                                                                                                             | [unit]         | `gpg::tests::a_five_megabyte_payload_round_trips_without_deadlocking`                                                                                                                         | PASS      |
| Passphrase with a newline rejected                                                                                                                      | [unit]         | `gpg::tests::a_passphrase_with_a_newline_is_rejected_before_spawning`, `passphrase.test.ts > refuses empty, short, mismatched and newline passphrases`                                        | PASS      |
| gpg args/env never contain the passphrase (`get_args()`/`get_envs()`)                                                                                   | [unit]         | `gpg::tests::the_passphrase_never_reaches_argv_or_the_environment`                                                                                                                            | PASS      |
| Enable writes 3 armored `.gpg`, removes the `.json`, keeps `settings.json` plain                                                                        | [unit] + [e2e] | `crypto::tests::enable_writes_the_three_gpg_files_and_removes_the_plain_copies`; e2e `enabling Encrypt writes the .gpg files, and the next start asks for the passphrase` also reads the disk | PASS      |
| Disable reverses it                                                                                                                                     | [unit]         | `crypto::tests::disable_writes_the_plain_files_verifies_them_and_removes_the_gpg_files`                                                                                                       | PASS      |
| A failing verify step leaves the files unchanged                                                                                                        | [unit]         | `crypto::tests::a_failing_verify_step_leaves_every_file_as_it_was` (`GpgRunner::with_program` + a script that decrypts to different bytes)                                                    | PASS      |
| `load_all` is locked without the passphrase, loads with it                                                                                              | [unit]         | `crypto::tests::load_all_is_locked_without_the_passphrase_and_loads_with_it`, `crypto::tests::a_save_with_encryption_on_and_no_passphrase_is_reported_as_locked`                              | PASS      |
| Legacy import gives 5/1/2 (bad-port -> 22 + warning); second import 0                                                                                   | [unit]         | `legacy_import::tests::the_sandbox_fixture_imports_5_hosts_1_account_and_2_bookmarks`, `legacy_import::tests::a_second_import_adds_nothing_and_skips_every_name`                              | PASS      |
| Legacy dir byte-for-byte unchanged                                                                                                                      | [unit]         | `legacy_import::tests::the_legacy_folder_is_byte_for_byte_unchanged`                                                                                                                          | PASS      |
| Enable in Preferences with `test-passphrase-1`, reloadSession -> unlock modal; wrong passphrase shows the text and keeps the modal; the right one loads | [e2e]          | `gpg.e2e.ts > enabling Encrypt writes the .gpg files, and the next start asks for the passphrase`                                                                                             | PASS      |
| Cancel at unlock asks "Quit FastSSH?" then calls `quit_app`                                                                                             | [unit]         | `cryptoActions.test.ts > asks first, and quits only on OK`, `gpgModal.test.tsx > Cancel asks 'Quit FastSSH?' and then calls quit_app`                                                         | PASS      |
| Unreadable `.gpg`: readable error, Start empty renames it aside                                                                                         | [e2e]          | `gpg.e2e.ts > an unreadable .gpg file reports a readable error, and Start empty renames it aside` (asserts the aside file's bytes and that the folder holds nothing else)                     | PASS      |
| Menu item "Import from EasySSH" toasts 5/1/2                                                                                                            | [e2e]          | `gpg.e2e.ts > Import from EasySSH toasts 5 connections, 1 account, 2 bookmarks` (also the `bad-port` warning and the WelcomeView button label)                                                | PASS      |
| One screenshot of the unlock modal                                                                                                                      | [agent]        | `docs/screenshots/stage_10/unlock-modal.png` - "Unlock your library" with the field, Cancel/Unlock; taken in the spec right after `reloadSession`                                             | PASS      |
| Milestone `E2E_ALL=1 tools/verify.sh full`                                                                                                              | [agent]        | the block above: `full verify: all OK`                                                                                                                                                        | PASS      |

- Screenshots (max 1 for this stage): `docs/screenshots/stage_10/unlock-modal.png`.
- Env-sanitize grep: **yes** - `grep -rn "Command::new\|CommandBuilder::new"`
  gives `gpg.rs:103` (followed by `sanitize_std_command(&mut c)` at :104, with
  `GNUPGHOME` set after it), `file_browser.rs:125` and `pty_manager.rs:78`, each
  sanitized; `commands/system.rs` uses `env_sanitize::clean_env()` for the xdg
  launcher.
- Real-files guard (verify.sh): **OK** in both runs.

## 10. Known issues / TODOs

- `src-tauri/tests/fixtures/legacy_*.json` are committed. They copy the sandbox
  fixture, so they contain the fake password `fastssh-test-pass` and a path to
  the sandbox test key (`~/fastssh-testenv/ssh/id_test`) - a path only, no key
  bytes, and nothing belonging to the owner.
- The passphrase is held in memory for the whole session; there is no "lock
  now" / idle lock. Not in the spec - see §12.
- `scrub_and_remove` zeroes + fsyncs + unlinks. On an SSD with wear levelling
  this is not a guaranteed erase (the plan's own note); real erasure would need
  `shred` or fstrim, which is out of scope.
- If both `<name>.json` and `<name>.json.gpg` exist (e.g. power loss between
  `enable`'s two passes), the plain file wins on load and the `.gpg` is left
  untouched. Harmless but worth a cleanup pass in Stage 12.
- The unlock modal has no attempt limit and no passphrase hint.
- Toasts hides load warnings while `locked`, so a genuine corrupt-file warning
  in the same folder only appears after unlocking. Accepted (§8.3).
- Check on a real device (docs/MANUAL_CHECKS.md, Stage 10): typing a real
  passphrase on real hardware, the missing-`gpg` tooltip on a machine without
  gnupg, and that the 22.04 AppImage finds `gpg` on `PATH` (Stage 12 packaging).

## 11. Instructions for the next stage

- First files to open: `src-tauri/src/lib.rs` (`AppState`, `invoke_handler`),
  `src-tauri/src/commands/crypto.rs`, `src/lib/cryptoActions.ts`,
  `src/components/Modals/GpgPasswordModal.tsx`, `src/hooks/useEncryptToggle.ts`,
  `src/components/HeaderBar.tsx` (menu items), `e2e/specs/gpg.e2e.ts`.
- Pitfalls noticed:
  - The unlock modal is driven by `store.locked`, not by the modal queue; it
    cannot be dismissed except by unlocking or Cancel -> Quit.
  - The Encrypt checkbox is re-mounted by `useEncryptToggle`'s `tick` so a
    cancelled attempt repaints the stored value; do not make it controlled
    directly.
  - `read_file_values` prefers a plain file over its `.gpg` twin - use the
    `locked` fixture set when a test must exercise decryption.
  - `typeInto` now self-checks; if a field still ends up empty, the window is
    not focused and the click/focus path needs a `browser.pause`.
  - Milestone runs need `docker start fastssh-sshd`; stop it afterwards and
    restore `~/fastssh-testenv/ssh/config` with `tools/make_fixtures.sh`, then
    delete `ssh/config.backup*`.
  - Rust gpg tests use `GpgRunner::with_gnupg_home(tempdir)` - never
    `~/.gnupg`. `GpgRunner::with_program(script, None)` runs a fake gpg script,
    which is the only way to test a failure real gpg will not produce on demand
    (see `crypto/tests.rs`).

## 12. Open questions for the human

1. Should FastSSH get a "Lock library now" action (drop the passphrase from
   `AppState` and show the unlock modal again)? The spec never asks for it, and
   Stage 10 keeps the passphrase until quit.
2. After a successful import, should the legacy files be renamed (e.g.
   `hosts.json.imported`)? R5 says FastSSH must never write to
   `~/.config/easyssh`, so Stage 10 leaves them; the user can import twice.
3. Stage 11 is "optional, P1 -> P3": which enhancement items do you want, and
   in what order? The plan's list is the default; say "all" or name the ones to
   skip.
