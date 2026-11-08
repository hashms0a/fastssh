# Manual checks — things only a human can verify

Each stage adds its items here. The agent never clicks through the UI by hand;
everything that can be asserted lives in a vitest unit test or an e2e spec.

## Stage 9 — two-way ~/.ssh/config sync

- [ ] **Enable Sync against your real `~/.ssh/config`.** Every automated test
      runs against the sandbox (`FASTSSH_SSH_DIR`), because writing the owner's
      real config needs explicit approval. On your own machine: turn the
      switch on in Preferences, read the confirm dialog (it names the file and
      the backup path), and accept. Then check that `~/.ssh/config` still has
      your global lines before the managed section, that your wildcard, `Match`
      and `Include` blocks are still there after it, and that `ssh <name>` for
      one of your hosts still connects. Delete that host in FastSSH and check
      its block disappears while everything else survives.
      **Your original file is copied to `config.backup` first, and a second
      enable writes `config.backup.<timestamp>` instead of overwriting it.**
- [ ] A `~/.ssh/config` that is a symlink (dotfiles repository): enabling sync
      and saving a host must leave the symlink intact and edit the file it
      points to. Unit-tested with a temp symlink; confirm with your real setup.
- [ ] Hosts that live inside an `Include` file are **not** imported (recorded
      limitation, plan Stage 9 note). Check that they still connect through the
      preserved `Include` line, and that FastSSH does not write a duplicate
      block for them.
- [ ] Sync mode against a real server with a zsh or fish prompt: the auto-login
      detection and the logout-close rule (R11) depend on the prompt shape;
      Localhost and the container only prove bash.
- [ ] A read-only `~/.ssh/config` (or a read-only `~/.ssh`): saving a host must
      still update the library and show a toast naming the file and the OS
      error, instead of failing the save. Unit-tested; confirm the toast reads
      well.
- [ ] Turning Sync back off: FastSSH stops rewriting the file, and the managed
      section you already have stays editable by hand.

## Stage 8 — preferences, session restore, quit flow

- [ ] **Browse for the hosts folder.** The native directory dialog cannot be
      driven by WebDriver, so the e2e specs type the path instead. Pick a
      folder that already has `hosts.json`: FastSSH asks "Load the library
      from <folder>?", and open tabs stay. Pick an empty folder: it asks
      "Copy the current library to <folder>?" and the three files appear
      there with mode 0600. Press Cancel: the field goes back to the old path
      and nothing is written.
- [ ] Close the window with the window manager's close button (and with the
      header menu's Quit): the app saves the open tabs and exits; on the next
      start those tabs reopen staggered. With many ssh hosts the fingerprint
      and error dialogs queue one at a time — check that feels calm.
- [ ] Preferences with a live terminal: change the font size and watch the
      open tab redraw immediately (no flicker, no lost scrollback), and the
      splitter/sidebar still fit at 800x500.
- [ ] Audible bell loudness and feel on real hardware (carried from Stage 6).
- [ ] The About dialog's license line: the project has no `LICENSE` file and
      no `license` key in `Cargo.toml` yet; a human should decide the license
      before Stage 12 ships the AppImage.

## Stage 7 — bookmarks, sftp file browser, links

- [ ] Click a https://example.com link printed in a terminal: the default
      browser opens. Click a file:///etc/passwd link (or any non-http scheme):
      nothing opens, and a toast says only http and https links are opened.
      Unit tests cover the scheme rule; the browser launch itself is a desktop
      behaviour.
- [ ] The OTHER desktop's file-manager path. This machine is GNOME, and its
      Nautilus 50 registers no x-scheme-handler/sftp, so xdg-open hands the URL
      to gio, whose mount asks for a password on the terminal and returns "The
      specified location is not mounted" (exit 4). FastSSH then shows the
      "Copy this address" toast, which is the specified failure behaviour and is
      asserted by the e2e spec. On a KDE machine, check that kioclient or
      dolphin opens the sftp URL, and on a GNOME machine whose Nautilus/GVFS
      does handle sftp, check that the GVFS password dialog appears and the
      share opens. **Type the password yourself; FastSSH never stores or types
      a GVFS password.**
- [ ] With a host in sync mode (Sync SSH config on, Stage 9), "Show in File
      Browser" opens the ssh_config block's real HostName/Port/User, not the
      alias.
- [ ] Bookmarks: the popover stays usable with a long command (wrapping,
      scrolling with 50+ bookmarks), and Escape while the delete confirmation is
      open cancels it without removing the bookmark.
- [ ] Audible bell (Stage 6 item, still open): loudness and the 200 ms throttle
      feel right on real hardware.

## Stage 10 - GPG encryption, unlock, EasySSH import

- [ ] Type a real passphrase on real hardware: enable Encrypt, quit FastSSH,
      start it again and unlock. The typed characters must match what the field
      shows (masked), and a wrong passphrase must keep what you typed so you can
      fix a typo. The e2e spec drives this with the sandbox passphrase
      `test-passphrase-1`; only a person can judge the typing feel and whether
      the modal steals focus at startup.
- [ ] On a machine **without** gnupg installed, the Encrypt switch must be
      greyed out with the tooltip "Install gnupg to enable encryption". Here gpg
      2.4.8 is present, so the spec cannot prove the missing-binary path.
- [ ] Start FastSSH on a machine that has `~/.config/easyssh` data written by
      the real EasySSH app, click "Import from EasySSH" and check the counts
      match what EasySSH shows. The sandbox fixture is a hand-written copy of
      the legacy shape.
- [ ] After enabling encryption, close the laptop lid / suspend for a while and
      unlock: the passphrase stays in memory, so FastSSH should still save
      without asking. If you want it to re-ask after idle, that is a decision -
      see HANDOFF_STAGE_10 §12.1.
- [ ] On the 22.04 AppImage (Stage 12), confirm `gpg` is found on `PATH` inside
      the AppImage environment; encryption without a system gpg needs a bundled
      binary, which Stage 10 does not do.

## Stage 11 - tab drag/rename, library backup, Localhost restore

- [ ] Drag a tab with a real mouse: grab a tab in a notebook with 3+ tabs, drag
      it left and right, and drop it between two tabs. The e2e spec dispatches
      HTML5 drag events (a W3C pointer drag starts no HTML5 drag under
      tauri-driver), so only a person can judge the drag affordance: does the
      dashed outline on the hovered tab make it obvious where the tab will land,
      and does the tab follow the pointer without flicker? Dropping a tab on
      another host's notebook must do nothing (the drag is per notebook).
- [ ] Double-click a tab to rename it: with a real mouse the first click of the
      double-click also selects the tab, which mounts its terminal pane. Check
      the rename field keeps the focus and the caret lands in the text, on both
      GNOME and KDE. Escape must cancel, Enter commit, and clicking elsewhere
      commit once.
- [ ] "Export library…" opens the native save dialog (GTK on GNOME, Qt on KDE).
      Pick a folder outside the config dir - a USB stick or the Desktop - and
      check the file is there, is plain JSON when Encrypt data is off, and is
      ASCII-armored `-----BEGIN PGP MESSAGE-----` (named `*.json.gpg`) when it is
      on. Cancel must write nothing. The dialog cannot be driven by the test
      harness; the unit test only proves the cancel path.
- [ ] Back up a library with 2000 hosts (`big` fixture): one menu press should
      finish well under a second and the toast should name the file; then open
      the file and check the count is 2000 and no Localhost entry appears.
- [ ] "Restore local shells too": with it on, quit with two Localhost tabs and
      start again - two local shells must reopen in `$HOME`, and the Localhost
      row must be selected. Then turn it off, quit and start: nothing reopens.
      On a machine where `$SHELL` is fish or zsh, confirm the restored tabs
      still close cleanly on `logout` (the prompt heuristics may miss those).
- [ ] "Lock library" on a real desktop: click it while three tabs are open. The
      unlock modal must appear at once, the open terminals must keep working,
      and editing a connection must fail with the locked message until you
      unlock. Nothing on disk changes.

## Stage 12 - polish, edge cases, release build

The automated edge pass (`e2e/specs/edge.e2e.ts`, 15 cases) covers the empty
library, 2000 hosts, a 255-character name, Unicode names, an empty user, IPv6
`::1`, an identity file path containing spaces, a missing identity file, a
read-only hosts folder, a corrupt `settings.json`, 5000 bookmarks, `kill -9`
mid-connect, 20 open tabs, closing a tab while it connects, and Retry spam.
These need a human or root:

- [ ] **Full disk while saving.** Needs `sudo`, so it is not automated. Mount a
      small tmpfs and point the library at it:
      `sudo mount -t tmpfs -o size=64k tmpfs /tmp/tinyfs`, start the app with
      `FASTSSH_CONFIG_DIR=/tmp/tinyfs`, create a connection and save.
      **Expect:** a red toast naming the file and the error (no space left on
      device), the new row disappears again (the store rolls back),
      `hosts.json` still parses, and the app stays usable. Then
      `sudo umount /tmp/tinyfs`.
- [ ] **Fractional display scale 125%.** GNOME Settings -> Displays -> Scale
      125% (the automated suite only ever runs at 100%). Start FastSSH, resize
      to the minimum 800x500, open a tab, and look at the sidebar, the tab bar
      and the terminal. **Expect:** nothing clipped or blurry, the tab bar
      scrolls instead of pushing the "New tab" button off-screen, scrollbars and
      text stay readable, and the window opens at the saved size on restart.
- [ ] **Second monitor.** Drag the window to the second monitor, maximize there,
      quit with `Ctrl+Q`, start again. **Expect:** the window comes back on that
      monitor at the same size, the open tabs restore, and maximizing/fullscreen
      (`F11`) behave on both screens.
- [ ] **The other session type.** The machine profile is GNOME on Wayland, so
      log into the Ubuntu _X11_ session (or the reverse) and run the AppImage.
      **Expect:** the window renders (no blank area), `Ctrl+Shift+C/V` copy and
      paste work through the clipboard, `Ctrl+Shift+E` opens the file manager,
      and the window close request still saves the settings.
- [ ] **Suspend and resume.** Connect to a real host, suspend the machine for a
      minute, resume. **Expect:** the tab shows what ssh printed (connection
      closed or the prompt back); no crash, and _Retry_ reconnects in a new tab
      if the session died.
- [ ] **NVIDIA + Wayland.** The build machine has an AMD GPU; on an NVIDIA card
      check the window renders without the DMABUF workaround being disabled
      (About shows `DMABUF disabled: yes`).
- [ ] **Run the AppImage on a clean install** (no `libfuse2t64`):
      `./FastSSH_1.0.0_amd64.AppImage --appimage-extract-and-run` must open a
      rendered window, connect to a real host, run `gpg` encryption, and open
      the file manager with no `symbol lookup error` in the terminal that
      launched it.
- [ ] **Desktop entry.** After installing the AppImage (e.g. with
      `appimagelauncher`), check the app grid shows the FastSSH icon and name,
      and that the entry's `Categories=` puts it in the Internet/Remote-access
      and Terminal sections.
- [ ] **Real passphrase.** Enable encryption with a passphrase containing spaces
      and check the unlock dialog accepts it after a restart, and that _Lock
      now_ followed by the wrong passphrase reports "wrong passphrase" instead
      of an empty library.
- [ ] **Click through the release AppImage.** `tauri-driver` cannot attach to a
      binary launched through an AppImage: `E2E_APP=tools/e2e-appimage.sh` and
      `E2E_APP=tools/e2e-appimage-run.sh` (extracted AppDir `AppRun`) both fail
      in the WebdriverIO tauri service with
      `before() failed at stage="addTauriApi:single" — mode=binary
provider=external ... Cannot read properties of undefined (reading 'bind')`,
      so the UI steps inside the AppImage are manual. Run
      `./tools/dev-sandbox.sh appimage` (FUSE) or
      `./tools/dev-sandbox.sh appimage-extract` (no FUSE) and check:
      open a Localhost tab and run `env | grep -E 'APPDIR|APPIMAGE|mount_'`
      (**expect nothing**), then `ldd /usr/bin/ssh | grep -c mount_`
      (**expect 0**); connect item10 or a real host; enable encryption, restart,
      unlock with the passphrase; press `Ctrl+Shift+E` on a remote tab and see
      the file manager open. The status line at the bottom must read
      `AppImage: yes`, and nothing in the log may say `symbol lookup error`.
      What is already proven without a driver: the window renders in both modes
      (`docs/screenshots/stage_12/appimage-fuse.png`,
      `appimage-extract-and-run.png`), the binary needs `GLIBC_2.34`, and the
      shipped bundle contains no `__fastsshTest` hook.
