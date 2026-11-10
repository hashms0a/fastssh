# FastSSH

A desktop SSH client for Linux: a connection library in a sidebar, terminal tabs
per connection, credentials/accounts, bookmarks, tunnels, optional GPG
encryption of the library, two-way `~/.ssh/config` sync, and import from
EasySSH 1.7.x. Built with Tauri 2 (Rust) + React + xterm.js.

FastSSH runs `ssh` in a pseudo-terminal; it does not implement SSH itself. Your
host keys, agent, and `~/.ssh/config` behaviour stay yours.

<img width="1100" height="640" alt="header-menu" src="https://github.com/user-attachments/assets/574feefe-ae14-441f-ade7-d6e453ca534a" />

## Install

Download [`FastSSH_1.2.0_amd64.AppImage`](https://github.com/hashms0a/fastssh/releases/tag/v1.2.0) and make it executable:

```bash
chmod +x FastSSH_1.2.0_amd64.AppImage
./FastSSH_1.2.0_amd64.AppImage
```

AppImages normally need FUSE. On Ubuntu/Kubuntu 22.04+ that is `libfuse2t64`:

```bash
sudo apt install libfuse2t64
```

Without FUSE, run it in extract-and-run mode (slower start, no FUSE needed):

```bash
./FastSSH_1.2.0_amd64.AppImage --appimage-extract-and-run
```

Requires X11 or Wayland with WebKitGTK 4.1 (bundled in the AppImage).

## Features and shortcuts

Shortcuts are matched on the physical key code, so they work on any layout.

| Key                              | Action                                                         |
| -------------------------------- | -------------------------------------------------------------- |
| `Ctrl+Shift+T`                   | New tab for the selected connection                            |
| `Ctrl+Shift+W`                   | Close the active tab                                           |
| `Ctrl+Shift+ArrowLeft` / `Right` | Previous / next tab                                            |
| `Ctrl+Shift+C` / `V` / `A`       | Copy / paste / select all in the terminal                      |
| `Ctrl+Shift+F`                   | Search in the active terminal                                  |
| `Ctrl+G` / `Ctrl+Shift+G`        | Search next / previous (while search is open)                  |
| `Ctrl+Shift+E`                   | Show the connected host in the system file manager (`sftp://`) |
| `Alt+C`                          | Copy the last command's output                                 |
| `Alt+Up`                         | Scroll to the last command prompt                              |
| `F11`                            | Fullscreen                                                     |
| `Ctrl+Q`                         | Quit (saves window size and the open tabs)                     |
| `Escape`                         | Close search, menus, popovers, dialogs                         |

Sidebar: arrow keys move the selection, `Enter` connects. Right-click a
connection for the context menu (duplicate, remove, move to group). The header
menu holds Preferences, Import from EasySSH, Back up library, Lock library and
About.

Long-running tabs are marked with a dot when output arrives in a tab you are not
looking at; clicking the tab clears it.

## Where your data lives

Everything is plain JSON (or GPG-armored JSON) with mode `0600` in a directory
with mode `0700`. Default location: `~/.config/fastssh` (respects
`XDG_CONFIG_HOME`).

| File                                                            | Contents                                                                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hosts.json`                                                    | Connections: name, group, host, port, user, password, identity file, account, colour/font overrides, tunnels, extra arguments, ssh_config block                           |
| `accounts.json`                                                 | Shared credentials (user, password, identity file) referenced by connections                                                                                              |
| `bookmarks.json`                                                | Named commands, run in the active tab                                                                                                                                     |
| `settings.json`                                                 | Window size/position flags, theme, terminal font/size/background/scrollback, hosts folder, restore flags, ssh_config sync and encryption flags, open tabs (`openedHosts`) |
| `hosts.json.gpg`, `accounts.json.gpg`, `bookmarks.json.gpg`     | The same three files when encryption is on                                                                                                                                |
| `<hosts folder>/backups/fastssh-library-<YYYYMMDD-HHMMSS>.json` | Library backup (one file, all three collections)                                                                                                                          |
| `~/.ssh/config.backup`, `~/.ssh/config.backup.<unix-time>`      | Backups taken before ssh_config sync writes                                                                                                                               |

Writes are atomic (temp file in the same directory, fsync, rename). A file that
cannot be parsed is renamed `<name>.json.corrupt-<unix-time>` instead of being
overwritten, and the app says so on screen.

Override the locations for testing or a portable setup:

| Variable             | Default             |
| -------------------- | ------------------- |
| `FASTSSH_CONFIG_DIR` | `~/.config/fastssh` |
| `FASTSSH_SSH_DIR`    | `~/.ssh`            |
| `FASTSSH_LEGACY_DIR` | `~/.config/easyssh` |

When `FASTSSH_SSH_DIR` is set, ssh is started with `-F <dir>/config` and
`UserKnownHostsFile=<dir>/known_hosts`, so nothing touches your real `~/.ssh`.

Passwords are stored in the library as plain text unless encryption is enabled
(see below). They are never put on the ssh command line — the app types them
into the terminal when ssh asks.

## Import from EasySSH

Menu → _Import from EasySSH_ reads `~/.config/easyssh/hosts.json`,
`accounts.json`, `bookmarks.json` (or `FASTSSH_LEGACY_DIR`). The legacy files
are never modified. Names that already exist are skipped and reported
(`Imported 5 connections, 1 account, 2 bookmarks — 5 skipped`), duplicate or
missing ids get a new UUID, and the legacy key spellings (`identity-file`,
`extra-arguments`, string `port`) are accepted.

## SSH config sync

Preferences → _Sync SSH config_ makes `~/.ssh/config` and the library agree:

1. `~/.ssh/config` is backed up first (`config.backup`, then
   `config.backup.<unix-time>`); nothing is written before the backup exists.
2. Host entries in the managed section are imported into the library, group
   `SSHConfig`.
3. The library is written back into the managed section, delimited by:

   ```
   # >>> FastSSH managed hosts (edits here are overwritten) >>>
   ...
   # <<< FastSSH managed hosts <<<
   ```

4. Everything outside that section is kept verbatim, in the original order:
   comments, `Include`, wildcard hosts, negated hosts, and every `Match` block.
   Managed blocks are written _before_ user wildcard/`Match` blocks, because ssh
   uses the first match.
5. Inside a managed block FastSSH owns `Host`, `HostName`, `User`, `Port`,
   `IdentityFile` and the `LocalForward`/`RemoteForward` lines; other lines in
   that block are preserved. Turning sync off removes the managed section and
   leaves the rest of the file alone.

Later saves update the managed section automatically; a failed export is a
warning, not a lost save.

## Encryption

Preferences → _Encrypt_ (needs `gpg`): `hosts.json`, `accounts.json` and
`bookmarks.json` become `*.json.gpg` (AES256, symmetric, ASCII-armored). The
passphrase is held in Rust memory only — never written to a file, never logged,
never passed to the frontend, and only ever given to `gpg` on stdin. _Lock now_
drops it and the unlock dialog returns.

Not protected by encryption: `settings.json` (window size, theme, restore list),
`~/.ssh/known_hosts` (owned by ssh), and the terminal history in memory. On a
locked start the app asks for the passphrase before it loads anything; an
unreadable `.gpg` file is reported and can be renamed aside with _Start empty_.

The old plain files are overwritten with zeros before deletion when encryption
is enabled. That is hygiene, **not secure deletion**: on SSDs and copy-on-write
filesystems (btrfs, snapshots, journaling) the old blocks can survive, and disk
wear-leveling may write elsewhere. If the machine is lost, assume any
previously stored password is readable.

## Building from source

Requirements: Rust (stable), Node 22+, and on Ubuntu/Kubuntu:

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf xdg-utils \
  openssh-client gnupg libfuse2
```

Then:

```bash
npm install
npm run tauri build -- --bundles appimage
```

Output: `src-tauri/target/release/bundle/appimage/FastSSH_1.2.0_amd64.AppImage`.

**glibc:** the AppImage must be built on Ubuntu 22.04 (glibc 2.35) so it runs on
22.04 and later. On another distribution use the container script instead:

```bash
bash tools/build-appimage-jammy.sh   # builds inside ubuntu:22.04, copies the result to dist-release/
```

That script builds in a container with a separate `src-tauri/target-jammy` and
an npm cache outside the repo, then re-packs the AppImage so the desktop entry
it installs has `Name=FastSSH` and
`Categories=Network;RemoteAccess;TerminalEmulator;` (Tauri writes an empty
`Categories=` line).

Building on a newer host links against that host's glibc; the README then states
the minimum glibc of the machine that produced the file.

## Development

```bash
./tools/dev-sandbox.sh dev       # runs the app against ~/fastssh-testenv, never your real files
./tools/build-debug.sh           # debug binary with the e2e test hook (Vite mode "e2e")
bash tools/verify.sh quick       # prettier, eslint, tsc, vitest
bash tools/verify.sh full        # + clippy, cargo test, debug build, launch smoke, e2e specs
E2E_ALL=1 bash tools/verify.sh full   # the whole e2e suite
npm run e2e                      # all specs; npm run e2e:one e2e/specs/smoke.e2e.ts for one
```

The sandbox (`tools/dev-sandbox.sh`) sets `FASTSSH_CONFIG_DIR`,
`FASTSSH_SSH_DIR` and `FASTSSH_LEGACY_DIR` to `~/fastssh-testenv`, and
`tools/make_fixtures.sh` builds the fixture library, the test sshd
(`tools/test-sshd`, container) and the large files the perf specs use.
`tools/verify.sh` also diffs your real `~/.ssh/config`, `~/.ssh/known_hosts`,
`~/.config/easyssh/*` and `~/.config/fastssh/*` against a baseline so a test
that leaked into real files fails the gate.

e2e tests drive the real window through WebdriverIO + tauri-driver; the app
exposes a read-only hook (`window.__fastsshTest`) only in dev/e2e builds, and
`npm run build` (release) must not contain it.

## Troubleshooting

- **Blank window / black area.** The DMABUF renderer misbehaves on some drivers.
  FastSSH sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` itself (About shows
  `DMABUF disabled: yes`). If you unset it in the environment, unset it back.
- **`symbol lookup error` or a crash at start from the AppImage.** Report it:
  the app strips AppImage variables (`APPDIR`, `LD_LIBRARY_PATH`,
  `GI_TYPELIB_PATH`, `PYTHONPATH`, …) from child processes precisely so `ssh`,
  `gpg` and `xdg-open` use system libraries. A new leak is a bug.
- **The file manager does not open** on `Ctrl+Shift+E`. It needs a desktop
  `sftp://` handler (`gio open sftp://user@host:port/` is what the app offers to
  copy). It is disabled for the local shell.
- **"Host key changed"** — ssh refuses to connect and shows its own message.
  FastSSH never edits `known_hosts`; fix the key yourself with
  `ssh-keygen -R <host>` once you have verified the new key.
- **Nothing restores on start.** Restore is off by default: enable _Restore
  open tabs on start_ in Preferences (and _Restore local shells_ for Localhost
  tabs).
- **GPG errors / "gpg not found".** Install `gnupg`; encryption needs the
  system `gpg`.

## Signing

AppImages here are **not signed**; `tauri build` does not sign and this project
does not publish signatures. If signing is added later
(`appimagetool --sign` with a GPG key), users verify with the matching public
key: replacing the key means older signatures no longer verify, and users must
import the new public key. There is no auto-updater, so nothing else depends on
the key.

## Development

```bash
npm ci
npm run verify:quick   # prettier, eslint, tsc, vitest
npm run dev            # frontend only
npm run tauri dev      # full app (needs the Linux deps above)
```

`npm run verify full` adds the debug build, a launch smoke test, and the e2e
suite. CI on GitHub runs the frontend checks only; the e2e suite needs a
desktop session and the sandbox sshd container.

## License

MIT — see [LICENSE](LICENSE).
