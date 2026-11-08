# Manual checks — things only a human can verify

Each stage adds its items here. The agent never clicks through the UI by hand;
everything that can be asserted lives in a vitest unit test or an e2e spec.

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
