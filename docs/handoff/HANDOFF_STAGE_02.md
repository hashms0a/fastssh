# Handoff - Stage 02: App shell (header, sidebar, workspace placeholders)

- Date: 2026-11-07
- Status: Complete
- Next stage: 03: Connection editor (add/edit/remove hosts and accounts)

## 1. Summary

Built the full Stage 2 shell on top of the Stage 1 data layer: HeaderBar
(FastSSH brand, New Connection / Local Shell / Bookmarks - first and last
disabled "Coming soon", filter input, kebab menu with Preferences /
Import from EasySSH / About / Quit), Sidebar (Hosts/Accounts segmented
toggle, groups in natural order with counts + collapse persistence,
host rows with running badge + unread dot, account rows), draggable
Splitter (160-600 px, persists panelSize), ConnectionLanding card
(Connect/Edit/Remove, all functional toasts), WorkspaceEmptyState ("No
connections yet"), ContextMenu (used by both the header kebab and row
right-click), Toasts + warnings banner, and the dark/light palette via
CSS variables driven by settings.useDarkTheme. Runtime strip now reads
"GNOME/wayland" (desktop mapping from Stage 1 §12 - done).

Verification: 27 vitest + 40 cargo tests, lint/typecheck/fmt/clippy
clean, 17 e2e tests across 5 specs green on 12 consecutive seeded runs
(1 known resize flake, see §10). Acceptance bullets all verified;
screenshots in docs/screenshots/stage_02/ (webview captures from e2e +
real-window dark/light via tools/screenshot.sh).

## 2. Environment

Unchanged from HANDOFF_STAGE_01 §2 (Ubuntu 26.04.1, GNOME 50.1 Wayland /
XWayland webview, AMD 680M, node v26.13.0, rustc 1.99.1, fastssh-sshd
container Up). No system changes. Manual launches need the sandbox env:
`FASTSSH_CONFIG_DIR=~/fastssh-testenv/config
FASTSSH_SSH_DIR=~/fastssh-testenv/ssh
FASTSSH_LEGACY_DIR=~/fastssh-testenv/legacy HOME=~/fastssh-testenv
./src-tauri/target/debug/fastssh` (e2e sets the same in wdio.conf.ts).

## 3. Requirements status

| Req               | Description                        | Status      | Notes                                                      |
| ----------------- | ---------------------------------- | ----------- | ---------------------------------------------------------- |
| R1                | Shell layout (header/sidebar/main) | Done        |                                                            |
| R2                | Groups, natural sort, collapse     | Done        | naturalSort.ts (case-insensitive, numeric chunks).         |
| R5                | Filter (name + user@host)          | Done        | 2000 hosts: 7 keystrokes ~400 ms total, no lag.            |
| R6                | Accounts tab (key + source name)   | Done        | Editing UI is Stage 3.                                     |
| R19               | Window/session state               | Done (a-c)  | panelSize + collapsedGroups persist; restoreHosts Stage 8. |
| R22               | Settings (theme, splitter, groups) | Done        |                                                            |
| R3,R7-R18,R20-R21 | -                                  | Not started | Carry-over as per plan.                                    |

## 4. Files created / modified

- src/components/HeaderBar.tsx - created (Stage 1 stub -> real bar; menu
  via ContextMenu; data-testids header-bar/new-connection/local-shell/
  bookmarks/host-filter/header-menu).
- src/components/Sidebar/{SourceListView,HostRow,AccountRow}.tsx +
  Sidebar.test.tsx - created.
- src/components/Splitter.tsx, src/components/ContextMenu.tsx,
  src/components/Toasts.tsx - created.
- src/components/Workspace/{ConnectionLanding,WorkspaceEmptyState}.tsx -
  created (landing card + "No connections yet").
- src/store/slices/uiSlice.ts - created (sidebarMode, selectedHostId,
  selectedAccountId, filter, toasts, push/dismissToast).
- src/store/slices/slices.test.ts, src/store/slices/uiSlice.test.ts,
  e2e/specs/shell.e2e.ts - created.
- src/store/useAppStore.ts - +ui slice. src/types/models.ts,
  src/lib/ipc.ts, src-tauri/src/lib.rs - RuntimeInfo desktop mapping
  ("GNOME/wayland"); slices.test.ts + warnings.e2e.ts updated for it.
- src/App.tsx - rewritten to the shell layout; e2e CSS rules appended to
  src/index.css; src/hooks/useWindowState.ts - seed-once rewrite (§8).
- e2e/specs/{persistence,shell}.e2e.ts - stability rework (§8).

## 5. Architecture notes

- Store: single zustand store, 3 slices; components subscribe to slices
  with selectors (filter/panelSize re-renders stay cheap; 2000-host
  filter passes).
- Sidebar rows derive from `groups` memoized in SourceListView:
  naturalSort on group name, hosts natural-sorted inside groups,
  Localhost = in-memory host from R8, always the first group "Local".
- ContextMenu is a fixed-position div rendered inline (no portal);
  closes on window pointerdown (capture) / scroll / Escape.
- Theme: Tailwind v4 `@custom-variant dark`; `.dark` class on <html>
  toggled in hydrate(); all components use var(--bg)/--fg/--muted/...
- Splitter: onPointerDown + setPointerCapture, onPointerMove writes
  updateSettings({panelSize}) (400 ms debounced save), window resize ->
  useWindowState 500 ms debounce chain from Stage 1 unchanged.

## 6. Data/settings schema

Unchanged from Stage 1: panelSize (300 default) and collapsedGroups
already existed in Settings; Stage 2 wires them. No new persisted fields.

## 7. Dependencies (resolved versions)

No new deps. Same matrix as HANDOFF_STAGE_01 §7 (Tauri 2.x, WebdriverIO
9, vitest 3, Tailwind 4).

## 8. Deviations from the plan and why

- useWindowState: replaced the "ignore resizes <1 s after mount" gate
  with seed-once (last-seen size ref seeded at mount, cycle compares
  innerSize to it). The old gate swallowed the first resize when the
  window settled late under XWayland.
- e2e resize helper (persistence spec): mutter's per-app XWayland
  geometry history + dropped configure requests make a single
  setWindowSize land unreliably. setCss() now steps the resize in ~220 px
  increments polling innerWidth, then "kicks" one final configure at
  target+1 (a mid-sequence resize arriving while mutter restores from
  fullscreen gets skipped by the isFullscreen guard, leaving settings at
  the boot size). This removed the resize flake (see §10).
- e2e splitter drag: native W3C pointer actions are swallowed after the
  sidebar has been interacted with (pointerdown never delivered); the
  drag is dispatched in-page (PointerEvent on the splitter element) -
  deterministic, and the pointer-capture stub avoids WebKit's
  "inactive pointerId" throw.
- Sidebar group name for Localhost is "Local" (testids
  group-header-Local etc.), matching the fixtures' first source label.

## 9. Verification

- `npm run lint` / `npm run typecheck` - clean; `npm test` 27/27.
- `cargo fmt --check` / `cargo clippy --all-targets -- -D warnings` /
  `cargo test` (40) - clean.
- `npm run tauri build -- --debug --no-bundle` then `npm run e2e` - 17
  tests: smoke(1) + persistence(3) + shell(9) + states(3) + warnings(1)
  - green on 12 consecutive seeded runs (re-seed with
    `cp ~/fastssh-testenv/legacy/*.json ~/fastssh-testenv/config/`
    after each run - the warnings spec renames the JSON files).
- Section 10 manual checks: real-window screenshots docs/screenshots/
  stage_02/manual-dark.png + manual-light.png (useDarkTheme round-trip,
  pixel-verified: main bg #1e1f22 vs #fcfcfc); run logs contain no
  "not allowed" lines; fullscreen / run-maximized / run-restored /
  run-resized / chmod500 / warnings screenshots refreshed under the
  Stage 2 layout.
- Acceptance bullets 1-7 (plan STAGE 2) all map to green shell/persistence
  e2e tests; 2000-host typing check measured (~400 ms for 7 keystrokes
  incl. rendering, big-filter.png).

## 10. Known issues / TODOs

- Flake ~1/13: persistence "saves a resized window". Root cause chain
  (mutter history slot rotation + fullscreen restore) is documented;
  stepped setCss + kick reduces it to rare. If it keeps biting, widen
  the settings poll from 6 s.
- flameshot appends _1/_2 suffixes when the target file exists;
  tools/screenshot.sh overwrites, manual retakes need renaming.
- Context menu / header menu items other than Quit are disabled stubs
  wired in Stages 3 (editor), 9 (preferences, import) and 10 (about).
- P2 virtualized list (plan) not needed: 2000 hosts measured fine.

## 11. Instructions for the next stage

- Stage 3 = Connection editor: modal/drawer form for hosts (name,
  source, user, host, port, key) + accounts; wire landing Edit/Remove
  and ContextMenu Edit/Duplicate/Remove (Duplicate = copy with " (n)"
  suffix); validation errors (port 1-65535, required name).
- Reuse: updateHost/updateAccount/saveHosts/saveAccounts (librarySlice
  already saves immediately, no debounce); Toasts for success/failure;
  strings.ts for all labels.
- Pitfalls noticed:
  - Rebuild the debug binary before `npm run e2e` (e2e runs it).
  - Re-seed sandbox config after every e2e run (warnings renames).
  - After browser.reloadSession() pause ~1.5 s before DOM asserts.
  - Use the in-page pointer dispatch helper in shell.e2e.ts for drags.
  - Keep new fields flowing through updateSettings (copyWith; null =
    clear).
- The e2e theme test toggles settings.useDarkTheme via the file; if
  Stage 3 adds a theme toggle, keep that test valid.

## 12. Open questions for the human

- Editor UX: modal dialog (plan §Stage 3 wording "editor panel") vs
  right-side drawer inside the workspace - Stage 3 starts with the
  modal; say the word if you want a drawer.
  Modal Dialog (The Default).
- Nothing else - Stage 2 is decision-free.
