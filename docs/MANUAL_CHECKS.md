# Manual checks — things only a human can verify

Each stage adds its items here. The agent never clicks through the UI by hand;
everything that can be asserted lives in a vitest unit test or an e2e spec.

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
