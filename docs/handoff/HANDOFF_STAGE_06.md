# HANDOFF_STAGE_06 — Complete. Terminal tools work: full shortcut matrix (spec §9) with key routing through xterm, search toolbar with cyclic/case rules, Alt+C / Alt+Up, unread dots with window focus, audible bell, right-click menu, clipboard. `verify.sh full tools tools-menu` passes.

Date: 2026-11-08
Status: Complete
Next stage: 07 — Bookmarks popover, SFTP file browser, web links

## 1. Summary

Stage 6 tasks 6.1–6.10 are done and all 9 Stage 6 acceptance bullets are
proved (5 `[e2e]` groups, 3 `[unit]` groups, 1 `[agent]` screenshot). The key
matrix matches on `e.code`, xterm ignores those chords through
`attachCustomKeyEventHandler`, and the window handler dispatches the actions.
Search, Alt+C/Alt+Up, unread dots, the bell, the context menu and the clipboard
are wired; `Ctrl+Shift+E` and the web-link handler log/toast until Stage 7
adds `open_url`. Gate ran once at the end (`tools/verify.sh full tools
tools-menu` — the Stage 6 spec was split in two, so both names are passed).
Docker = no for this stage; the `fastssh-sshd` container was stopped
afterwards.

## 2. Environment (unchanged since Stage 0A)

Ubuntu 24.04 / GNOME / Wayland + XWayland, x86_64, screen 2560x1440.
Node v26.13.0, npm 11.20.0, rustc 1.99.1, cargo 1.99.1,
`XDG_CURRENT_DESKTOP=ubuntu:GNOME`, `XDG_SESSION_TYPE=wayland`. No tool was
installed in this session (no sudo used). Sandbox `~/fastssh-testenv`; the
owner's `~/.ssh`, `~/.config/easyssh`, `~/.config/fastssh` untouched
(verify.sh "real files OK"). Container `fastssh-sshd`: **stopped** at the end
(Stage 6 Test Matrix: Docker = no). Machine changes: none.

Session start: `HEAD = 55a737f "Stage 05: SSH connections and prompt
heuristics"`. The only working-tree change was `docs/handoff/HANDOFF_STAGE_05.md`,
where the owner appended "yes" to the four `[human]` items; that edit is
committed with this stage, unchanged. No rebuild or re-test of Stage 5 was run
(Stage 5 handoff says Complete).

## 3. Requirements touched by this stage

Other rows keep the status in HANDOFF_STAGE_05 §2.

| Req  | Status  | What changed here                                                                                                                                   |
| ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| R12  | Done    | host color/font (Stage 4) + copy/paste/select-all, context menu, audible bell, clickable links (logged until Stage 7)                               |
| R13  | Done    | unread set once per episode and cleared by focusing the tab or by window focus; row dot from any tab of the host; tab-count badge from Stage 4      |
| R14  | Done    | SearchToolbar: input, Next/Previous, Cyclic (default on), Case (default on), "3 / 12" from `onDidChangeResults`, Escape closes + clears + refocuses |
| R15  | Done    | `lastCommand.ts` marker per Enter; Alt+C copies marker.line+1 .. baseY+cursorY-1; Alt+Up scrolls to the marker                                      |
| R16  | Partial | menu item present, disabled for Localhost; `Ctrl+Shift+E` toasts "Coming soon"; `open_url` arrives in Stage 7                                       |
| R17  | Done    | every row of the spec §9 matrix dispatches; `e.repeat` ignored; xterm ignores the app's chords                                                      |
| R19a | Done    | `useWindowState` keeps the restore size while fullscreen (unit-proven), F11 flips it (e2e)                                                          |

## 4. Files created / modified

Created

- `src/lib/searchModel.ts` (+ `.test.ts`) - pure search rules: `stepOutcome` (Cyclic off edges), `statusText`, `searchOptions` (decorations, `caseSensitive: !caseInsensitive`), `textMatches`
- `src/terminal/lastCommand.ts` (+ `.test.ts`) - `LastCommandTracker` over a `MarkerTerm` interface (fake-buffer testable)
- `src/terminal/bell.ts` (+ `.test.ts`) - `ringBell` (880 Hz sine, 80 ms, throttled 200 ms) + pure `shouldRing`
- `src/terminal/activeTab.ts` - the active tab / entry lookup shared by the actions and the search controller
- `src/terminal/terminalActions.ts` - copy / paste / select-all / copy-last-output / scroll-last-command / open-search / file-browser toast
- `src/terminal/searchController.ts` - toggle/close/step/apply-text against the SearchAddon
- `src/terminal/openLink.ts` - WebLinks handler; logs the URI until Stage 7
- `src/lib/clipboard.ts` - `copyText` (no-op on empty), `readClipboard` (never throws)
- `src/lib/windowOps.ts` - F11 `setFullscreen(!isFullscreen)`
- `src/components/SearchToolbar.tsx` - the toolbar (data-testids: `search-toolbar`, `-input`, `-count`, `-prev`, `-next`, `-cyclic`, `-case`, `-close`)
- `src/hooks/useWindowFocus.ts` - window focus/blur -> `windowFocused` + clear the visible tab's dot
- `src/hooks/useWindowState.test.ts` - the `[unit]` fullscreen bullet
- `e2e/specs/tools.e2e.ts` (9 tests) and `e2e/specs/tools-menu.e2e.ts` (2 tests)
- `docs/screenshots/stage_06/search-toolbar.png`

Modified

- `src/lib/shortcuts.ts` - the whole matrix on `e.code`, `isAppShortcut(e, searchOpen)`, `needsSearchOpen`
- `src/hooks/useShortcuts.ts` - dispatch table for all 16 actions
- `src/terminal/terminalRegistry.ts` - `last` tracker per tab, `WebLinksAddon(handler)`, `attachCustomKeyEventHandler((e) => !isAppShortcut(e, searchOpen))`, `viewportY()`/`markerLine()` helpers, bell hook in `createTerminal`
- `src/terminal/sessionController.ts` - `markOutput(tabId, windowFocused)` on PTY output; bell hook wiring
- `src/store/slices/tabsSlice.ts` (+ `.test.ts`) - `markOutput`, `clearUnreadOfActiveTab`, `cycleActiveTab`
- `src/store/slices/uiSlice.ts` - `searchOpen`, `search` state, `windowFocused`
- `src/components/Workspace/TerminalPane.tsx` - right-click menu (`terminal-menu`)
- `src/components/Workspace/HostNotebook.tsx` - SearchToolbar above the panes
- `src/components/ContextMenu.tsx` - Escape handled in the **capture** phase
- `src/App.tsx` - `useWindowFocus()`
- `src/lib/strings.ts`, `src/lib/testHook.ts` (viewportY, markerLine, unread, isFullscreen, readClipboard), `e2e/helpers.ts` (hook readers, `typeInto`, `contextMenuInPage`, `menuItemClick`, `menuItemDisabled`, `tabDotVisible`, `rowDotVisible`, `searchCount`, `parseCount`)

## 5. Architecture notes

- Key flow: xterm's `attachCustomKeyEventHandler` returns `!isAppShortcut(e,
searchOpen)`; when it returns false xterm neither sends the key to the PTY
  nor `preventDefault`s it, so the event bubbles to the `window` handler in
  `useShortcuts`, which calls `preventDefault()` and dispatches. Ctrl+G and
  Ctrl+Shift+G are app keys only while the toolbar is open, so `^G` still
  reaches the shell otherwise.
- Unread (R13): `tabsSlice.markOutput` returns early when the tab is already
  unread, so a burst of chunks writes the store once; it also returns early
  when the tab is the active tab of the selected host in hosts mode **and**
  `windowFocused` is true. `setActiveTab` and `clearUnreadOfActiveTab` clear it.
- Alt+C/Alt+Up (R15): one `term.registerMarker(0)` per Enter, previous marker
  disposed -> O(1) per keystroke, no store writes.
- Search (R14): the store holds the toolbar state, `searchModel.ts` decides
  whether to ask the addon or stop, `searchController.ts` performs the call.
  Results come back through `onDidChangeResults`, which only fires when
  `decorations` are passed.
- The terminal pane mounts its own context menu; hidden panes never render it.

## 6. Data / settings schema

Unchanged: `schemaVersion: 1`, no AppSettings field added. `audibleBell`
(existing) now drives the bell; `scrollbackLines` (existing) bounds Alt+Up.

## 7. Dependencies added or changed in this stage

- npm: none (clipboard-manager 2.5.0, @xterm/xterm 6.0.0, addon-search 0.16.0,
  addon-web-links 0.12.0, @tauri-apps/api 2.12.4 were already installed)
- cargo: none. Capabilities already listed `clipboard-manager:allow-read-text`
  /`allow-write-text` and `core:window:allow-set-fullscreen` /
  `allow-is-fullscreen`, so no capability change was needed.

## 8. Deviations from the plan and why

1. **`attachCustomKeyEventHandler` must return the negation.** Task 6.1 says
   `e => !isAppShortcut(e)`; the first implementation passed `isAppShortcut`
   itself, which made xterm ignore _every_ key (the Stage 4 spec failed on the
   first `runCommand`). Fixed in `terminalRegistry.ts`, and the Stage 4 spec's
   failure is what caught it.
2. **xterm addon-search 0.16 has no `cyclic` option.** Task 6.5 assumed
   `ISearchOptions.cyclic` and "call findPrevious to stay on the last one";
   0.16 always wraps and `findPrevious` would move back a match. Cyclic off is
   therefore decided in `searchModel.stepOutcome`: on the last match Next does
   not call the addon, the highlight stays, and the counter shows
   "No more matches". Prev is symmetric. Proven by `searchModel.test.ts` and
   `tools.e2e.ts` test 2.
3. **The plan's `printf 'a\nb\nc\n'` + search "b" cannot read "1 / 1".** The
   echoed command line is in the buffer and contains "b", so that query finds
   2 matches (search covers the whole scrollback, as in EasySSH). The spec
   proves "1 / 1" with `echo hello | rev` (output "olleh", absent from the
   typed line) and keeps `printf 'a\nb\nc\n'` for the Alt+C clipboard bullet,
   which reads exactly "a\nb\nc".
4. **Ctrl+Shift+E toasts for any tab, including Localhost,** so the row has an
   observable effect; the context-menu item stays disabled for Localhost
   because R16 is remote-only. Wired in Stage 7.
5. **Ctrl+Q is unit-proven only.** `run("quit")` calls `quit_app`; an e2e press
   would quit the app mid-spec. Stage 8's preferences/restore spec owns the
   quit flow (flush + Ctrl+Q + close button).
6. **The Stage 6 spec is split into two files** (`tools.e2e.ts` 266 lines,
   `tools-menu.e2e.ts` 92) to respect the 300-line rule; the gate therefore
   runs `tools/verify.sh full tools tools-menu` (`verify.sh` accepts several
   spec names). `e2e/helpers.ts` is 374 lines: shared spec helpers, on top of
   the 220 it already had.
7. **`ContextMenu` Escape moved to the capture phase.** xterm consumes Escape
   and stops propagation, so with the terminal focused a bubble-phase listener
   never fired and the menu stayed open. Sidebar/header menus are unaffected
   (their unit tests still pass).
8. **Right-click and text entry go through the page.** `contextMenuInPage`
   dispatches `contextmenu` (a W3C right click is unreliable on this driver,
   same reason `clickInPage` exists), and `typeInto` types one key per 70 ms
   because sending a whole string to the freshly-mounted search input drops
   its first character here.
9. **Dots are read inside the page** (`getClientRects()`), because this
   driver's CSS engine mishandles combined attribute selectors and the row dot
   span is always present but hidden.

## 9. Verification

`tools/verify.sh full tools tools-menu` (one run, after all tasks; Stage 6 is
not a milestone, so no `E2E_ALL`):

```
prettier       OK   1s      debug build    OK   8s
eslint         OK   2s      smoke          OK   8s
tsc            OK   3s      e2e tools      OK   27s   (9 passing)
vitest         OK   2s      e2e tools-menu OK   10s   (2 passing)
cargo fmt      OK   0s      real files     OK   0s
clippy         OK   0s      full verify: all OK
cargo test     OK   7s
```

Test counts: vitest 195 passed / 26 files, cargo 65 passed, e2e 11 passed
(2 spec files). During development the fast loop was `npx vitest run <file>`,
`npx tsc --noEmit`, and `npx wdio run e2e/wdio.conf.ts --spec
e2e/specs/tools.e2e.ts`.

Keys the desktop might intercept were checked with a throwaway probe that
logged every `keydown` in capture phase: `KeyC alt=true`, `ArrowUp alt=true`,
`F11` all arrive, so nothing is intercepted by GNOME and no workaround was
needed. The probe file was deleted.

Acceptance, one row per bullet:

| Bullet                                                                                            | Tag   | Proof                                                                                                                                                                             | PASS |
| ------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `isAppShortcut` table covers every spec row, matches `e.code`, Shift variants, ignores `e.repeat` | unit  | `src/lib/shortcuts.test.ts`: "shortcutFor: the spec section 9 matrix" (it.each over the 15 rows + "ignores auto-repeat for every row"), "isAppShortcut (the xterm filter)"        | PASS |
| e2e table over the rows with a visible effect                                                     | e2e   | see the row list below                                                                                                                                                            | PASS |
| At a prompt Ctrl+Shift+C and Alt+C insert nothing, no `^C`                                        | e2e   | `tools.e2e.ts` "Ctrl+Shift+C and Alt+C insert nothing into the shell line"                                                                                                        | PASS |
| Cyclic off stays on the last match / Case off does not match across case                          | unit  | `src/lib/searchModel.test.ts`: "Cyclic off: Next stays on the last match…", "Cyclic off: Previous stops at the first match too", "Case-insensitive off: ECHO does not match echo" | PASS |
| `printf 'a\nb\nc\n'` + search shows "1 / 1"                                                       | e2e   | `tools.e2e.ts` "search shows 1 / 1, and Case off makes an upper-case query find nothing" (see deviation 3)                                                                        | PASS |
| Alt+C: `readClipboard()` is "a\nb\nc"                                                             | e2e   | `tools.e2e.ts` "Alt+C copies the last command output (clipboard reads a\nb\nc)"                                                                                                   | PASS |
| `seq 1 500` + Alt+Up: `viewportY(tab) == markerLine(tab)`                                         | e2e   | `tools.e2e.ts` "Alt+Up scrolls the buffer to the start of the last command" (also asserts it moved up from the bottom and that the marker line holds the command)                 | PASS |
| 10,000 chunks to a background tab -> exactly one store write                                      | unit  | `src/store/slices/tabsSlice.test.ts` "unread output rule (R13)" / "10,000 chunks to a background tab write the store exactly once" (subscribe counts `set` calls)                 | PASS |
| Background output shows the tab dot and the row dot; focusing clears both                         | e2e   | `tools.e2e.ts` "output in a background tab lights the tab dot and the row dot"                                                                                                    | PASS |
| `useWindowState` ignores sizes while fullscreen                                                   | unit  | `src/hooks/useWindowState.test.ts` "ignores sizes while fullscreen so the restore size survives" (+ "writes only the maximized flag while maximized")                             | PASS |
| F11 toggles `isFullscreen()` both ways                                                            | e2e   | `tools.e2e.ts` "F11 toggles fullscreen on and off"                                                                                                                                | PASS |
| One screenshot of the search toolbar with a result count                                          | agent | `docs/screenshots/stage_06/search-toolbar.png`                                                                                                                                    | PASS |

Shortcut matrix, row by row (spec §9):

| Row                     | Proof                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ctrl+Q                  | unit row in `shortcuts.test.ts`; dispatched to `quit_app` in `useShortcuts.ts`; not pressed in e2e (deviation 5)                                                          |
| Ctrl+Shift+T            | e2e "Ctrl+Shift+T adds a tab…" (tab count 2 -> 3)                                                                                                                         |
| Ctrl+Shift+W            | same test (3 -> 2, active tab follows)                                                                                                                                    |
| Ctrl+Shift+Left / Right | same test, including wrap Right from the last tab to the first                                                                                                            |
| Ctrl+Shift+C            | e2e "Ctrl+Shift+C and Alt+C insert nothing…" (empty selection: no toast, nothing typed) and `tools-menu.e2e.ts` "Select All + Copy" (whole buffer lands in the clipboard) |
| Ctrl+Shift+V            | `tools-menu.e2e.ts` paste step (clipboard text appears at the prompt)                                                                                                     |
| Ctrl+Shift+A            | `tools-menu.e2e.ts` (Ctrl+Shift+A then Ctrl+Shift+C copies everything)                                                                                                    |
| Ctrl+Shift+F            | e2e "Ctrl+Shift+F opens the toolbar…"; also "Search" from the menu in `tools-menu.e2e.ts`                                                                                 |
| Ctrl+G                  | e2e test 2 (index 1 -> 2) and test 3 (single match stays 1 / 1)                                                                                                           |
| Ctrl+Shift+G            | e2e test 2 (index 2 -> 1)                                                                                                                                                 |
| Ctrl+Shift+E            | e2e "Ctrl+Shift+E toasts Coming soon"                                                                                                                                     |
| Alt+C                   | e2e Alt+C clipboard test + "Copied 3 lines" toast                                                                                                                         |
| Alt+Up                  | e2e Alt+Up scroll test                                                                                                                                                    |
| F11                     | e2e F11 test                                                                                                                                                              |

Screenshot (1 of the 1 allowed): `docs/screenshots/stage_06/search-toolbar.png`
— the toolbar over the Localhost notebook with query "1", counter "2 / 2",
Previous/Next, Cyclic unchecked, Case checked, the active match highlighted in
amber on the echoed command line, the sidebar with the Localhost badge "1", and
the Stage-1 "bad-port" warning toast at the bottom right.

- Env-sanitize grep: no Rust changed in this stage; every `Command::new` stays
  behind `PTY_SPAWN_ENV` / `env_sanitize` (Stage 1/5).
- Real-files guard: OK.

## 10. Known issues / TODOs

- **`Copied N lines` counts buffer rows**, so a command whose output wraps
  reports more lines than logical lines. Impact: wording only. Fix: count
  non-wrapped rows (`line.isWrapped`).
- **Search highlights cap at 1000 matches** (SearchAddon `highlightLimit`
  default). Impact: on a 68 MB `cat` the counter can read "1 / 1000". Fix:
  raise the limit or report ">1000".
- **The bell is silent when the session has no audio device** (the WebAudio
  call is wrapped in try/catch). Impact: no error, no sound. Loudness/feel is
  a `[human]` check.
- **Web links only log** (deviation of Stage 6 by design); `open_url` +
  `ipc.openUrl` arrive in Stage 7.
- **Clipboard runs on arboard's X11 fallback** here (the app logs
  "ext-data-control … not supported by the compositor"). Works under XWayland;
  a pure-Wayland clipboard without that protocol will paste nothing. `[human]`.
- **`e2e/helpers.ts` is 374 lines** (rule 7 is written for src modules; specs
  and shared spec helpers already exceeded it in earlier stages).
- Carried: bookmarks/search for remote hosts and "Show in File Browser" are
  Stage 7/11 items.

Check on a real device (`[human]`)

- Audible bell: loudness and the 200 ms throttle feel right on real hardware.
- KDE Plasma: does the desktop take any of Ctrl+Shift+*, Alt+C, Alt+Up, F11?
  (GNOME intercepts none of them here.)
- Pasting non-text clipboard content (an image) does nothing, with no toast.
- Bracketed paste into a real remote shell (zsh/fish) inserts without running.
- HiDPI fractional scaling: the toolbar and menu stay readable.

## 11. Instructions for the next stage (07: bookmarks, sftp, web links)

- First files to open: `src/terminal/openLink.ts` (replace the log with
  `ipc.openUrl`), `src/terminal/terminalActions.ts` (`showFileBrowser`),
  `src/components/Workspace/TerminalPane.tsx` (enable the remote-only item),
  `src/components/HeaderBar.tsx` (Bookmarks button -> `BookmarksPopover`),
  `src-tauri/src/commands/system.rs` + `src-tauri/src/file_browser.rs`
  (`open_url`, `sftp://` with xdg-open -> kioclient -> dolphin).
- Pitfalls noticed: xterm consumes Escape and stops propagation (menus must
  listen in capture phase); `browser.keys` into a just-mounted input loses its
  first character (use `typeInto`); combined CSS attribute selectors are
  unreliable on this driver (query inside `browser.execute`); Ctrl+Shift+E
  currently toasts "Coming soon" — the Stage 7 spec must replace that
  assertion, and the Stage 6 menu test asserts the item is disabled for
  Localhost.
- Test Matrix for Stage 7: Docker = yes (start `fastssh-sshd`), Spec =
  `bookmarks`, not a milestone, 1 screenshot.

## 12. Open questions for the human

- Should `Copied N lines` count logical lines (unwrap wrapped rows) or keep the
  buffer-row count?
  keep
- Should Ctrl+Shift+E on Localhost open `file://$HOME`, or keep the
  remote-only rule from R16?
  keep
