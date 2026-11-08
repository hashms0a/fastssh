# HANDOFF_STAGE_12 — Polish, tests, release AppImage, README. FastSSH is feature-complete: the edge/window/perf/a11y passes are in the suite and found five real bugs (a read-only library folder that the app quietly re-opened for writing, error objects rendered as `[object Object]`, a corrupt `settings.json` that reset with no warning, open tabs lost on `kill -9`, and a "New tab" button pushed off-screen by a long tab bar). The release AppImage is built against Ubuntu 22.04's glibc (`GLIBC_2.34`) in a container, with a desktop entry that carries `Categories=Network;RemoteAccess;TerminalEmulator;`, and it renders on this machine in both FUSE and `--appimage-extract-and-run` mode.

## 1. Summary

- Task 12.1: audited every `unwrap()`/`expect()` in non-test Rust (justified: poisoned mutexes, fixed-size arrays, `HOME` required) and every TS `catch`; the three user-facing ones that swallowed the message now go through `errorText()`.
- Task 12.2: `e2e/specs/edge.e2e.ts` — 15 cases. Full disk (needs `sudo`) and 125 % display scale went to `docs/MANUAL_CHECKS.md`.
- Task 12.3: `e2e/specs/window.e2e.ts` — 5 cases: minimum size 800×500, maximize/un-maximize, fullscreen and back, long tab title ellipsized, keyboard splitter clamped. Sidebar, tab bar and the document never overflow. Second monitor and the X11 session are `[human]` items.
- Task 12.4: `e2e/specs/perf.e2e.ts` — 3 cases: PTY output repaints the streaming tab only (sidebar and the other host's row stay at 0 renders, `src/lib/renderLog.ts`), a 68 MB `cat` over ssh does not block the header menu (< 6 s), closing 20 tabs leaves zero live xterm instances and RSS below the peak.
- Task 12.5: `e2e/specs/a11y.e2e.ts` — 7 cases: no icon-only control without a name, sidebar is a listbox with arrow-key selection and Enter-to-connect, Preferences traps Tab and restores focus, the editor is a dialog, a visible focus ring exists in the stylesheet, an unread tab names its dot. `src/themeContrast.test.ts` checks both palettes against 4.5:1.
- Task 12.6: `src-tauri/icons/source/fastssh.svg` (original terminal-prompt glyph) rendered to 1024 px and `npm run tauri icon`; the desktop entry now has the name, comment and categories the plan asks for.
- Task 12.7: `npm run build` then `grep -r "__fastsshTest" dist/` → nothing, and the shipped AppImage embeds no hook either (`grep -c __fastsshTest usr/bin/fastssh` → 0).
- Task 12.8: full list in §9.
- Task 12.9: `tools/build-appimage-jammy.sh` builds in `ubuntu:22.04` with a separate `src-tauri/target-jammy`, re-packs the AppDir with the linuxdeploy the build already downloaded so the desktop entry is correct, and copies to `dist-release/FastSSH_1.0.0_amd64.AppImage` (78 MB). `objdump -T` → `GLIBC_2.34`.
- Task 12.10: both launch modes verified with screenshots; the in-AppImage clicks are `[human]` because `tauri-driver` cannot attach to a binary launched through an AppImage (see §8).
- Task 12.11: README states the app is unsigned and what a future key change would mean.
- Task 12.12: `README.md` rewritten (install, shortcuts, data locations and formats, EasySSH import, ssh_config sync, encryption + the SSD caveat, building, development, troubleshooting, signing).
- Task 12.13: `docs/MANUAL_CHECKS.md` gained the Stage 12 items (full disk, 125 % scale, second monitor, X11 session, suspend/resume, NVIDIA + Wayland, clean-install AppImage, desktop entry, real passphrase, in-AppImage UI pass).

## 2. Environment (unchanged since Stage 0A)

Ubuntu 26.04, GNOME on Wayland, AMD GPU, `node v22`, Rust stable, Docker 29.1.3.
New in this stage: the `fastssh-appimage-jammy` Docker image (ubuntu:22.04 +
libwebkit2gtk-4.1-dev + Node 22 + rustup, ~30 MB base) and the cache directories
`~/.cache/fastssh-jammy/{home,node_modules}` the container writes to. The host
toolchain is untouched. The host's own glibc is 2.43, which is why the release
build goes through the container.

## 3. Requirements touched by this stage

No requirement changed status; these are the ones the fixes touch. Other rows
keep the status in HANDOFF_STAGE_11 §3, and R1-R22 are all Done.

| Req | Status | What changed here                                                                                                                                              |
| --- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R4  | Done   | A hosts folder the user made read-only keeps its mode, so a failed save reaches the UI and rolls the store back; a corrupt `settings.json` now warns on screen |
| R10 | Done   | The tab strip scrolls inside its own container and the "+" button sits outside it, so "New tab" stays reachable with 20 tabs                                   |
| R13 | Done   | `TabButton` gained `shrink-0`: tabs keep their width instead of being squeezed, which is what makes the strip scroll                                           |
| R19 | Done   | `openedHosts` is written by every debounced settings save, not only by the quit flow, so a crash restores what was actually open                               |
| R20 | Done   | `get_runtime_info` reads `APPIMAGE`/`APPDIR` from the process environment (the sanitized env has them stripped), so the status line says `AppImage: yes`       |
| R21 | Done   | `dist-release/FastSSH_1.0.0_amd64.AppImage` launches on this machine (GNOME/Wayland) in FUSE and extract-and-run mode with a rendered window                   |
| R22 | Done   | 2000-host, natural-sort and filter behaviour re-verified under the edge pass; WelcomeView verified with an empty library                                       |

## 4. Files created / modified

New:

- `e2e/specs/edge.e2e.ts` (15), `e2e/specs/window.e2e.ts` (5), `e2e/specs/perf.e2e.ts` (3), `e2e/specs/a11y.e2e.ts` (7) (created)
- `src/lib/renderLog.ts` - render counters behind the test hook, compiled out of a release build (created)
- `src/lib/sidebarKeys.ts` + `.test.ts` - the arrow-key/Enter selection model (created)
- `src/terminal/promptActions.ts` + `.test.ts`, `src/themeContrast.test.ts` (created)
- `src-tauri/icons/source/fastssh.svg` and the regenerated `src-tauri/icons/*` (created)
- `tools/appimage-jammy/Dockerfile`, `tools/build-appimage-jammy.sh` (created)
- `tools/e2e-appimage.sh`, `tools/e2e-appimage-run.sh` (created; the driver cannot attach through an AppImage, see §8)
- `docs/screenshots/stage_12/*.png` (created)

Modified:

- `src-tauri/src/storage.rs`, `src-tauri/src/hosts_folder.rs` (+ `storage/tests.rs`, `hosts_folder/tests.rs`) - 0700 only on a folder the app creates (modified)
- `src-tauri/src/storage/settings_io.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/storage/library.rs` (+ test) - boot warnings reach the first `load_all` (modified)
- `src/store/slices/settingsSlice.ts`, `src/store/slices/tabsSlice.ts` (+ `slices.test.ts`) - `markSettingsDirty`, open tabs in every save (modified)
- `src/store/slices/librarySlice.ts`, `src/terminal/sessionController.ts`, `src/main.tsx` - `errorText()` instead of `String(e)` (modified)
- `src/components/Workspace/HostNotebook.tsx`, `src/components/Workspace/TabButton.tsx` - scrollable strip + fixed "+" button, `shrink-0` tabs (modified)
- `src-tauri/src/commands/system.rs` - AppImage detection from the process env (modified)
- `src/lib/testHook.ts`, `e2e/helpers.ts` - `liveTerminals()`, `restartApp`, `killApp`, `readSettingsFile`, `alertTexts`, `hookLiveTerminals`, visible-notebook `openExtraTab` (modified)
- `e2e/specs/restore-local.e2e.ts` - the "openedHosts is cleared after restore" assertion replaced by the new invariant (modified)
- `tools/dev-sandbox.sh` - `appimage` / `appimage-extract` modes resolve `dist-release/` first (modified)
- `.prettierignore`, `.gitignore`, `eslint.config.js`, `tsconfig.json` - ignore `dist-release` and `src-tauri/target-jammy` (modified)
- `README.md`, `docs/MANUAL_CHECKS.md` (modified)

## 5. Architecture notes

- **Boot warnings.** `lib.rs` reads `settings.json` before the window exists so
  the first frame has the saved size. That read renames a corrupt file aside, so
  the frontend's later `load_all` would see nothing to report. `load_settings_for_boot`
  parks the warnings in a `static Mutex<Vec<String>>` and `storage::load_all`
  drains them once into its report.
- **Who owns the hosts folder's mode.** `data_dir_for` and `copy_library` used to
  `chmod 0700` the folder on every load. Now they only do it for a folder they
  created. A folder the user made read-only stays read-only, `atomic_write`
  fails, and `makeSaver` rolls the list back and shows the error.
- **Settings writes carry the tabs.** `settingsSlice`'s debounced saver stamps
  `openedHosts` from the live `tabOrder` whenever `restoreHosts` is on;
  `addTab`/`removeTab`/`dropHostTabs` call `markSettingsDirty()` so a tab change
  schedules a save. The quit flow still patches and flushes explicitly. The
  consequence: after a restore, `settings.json` keeps naming the tabs that are
  open, which is what a crash needs.
- **Tab bar layout.** `HostNotebook` renders an outer flex row; the `tab-bar`
  (role=tablist) is the scroll container with `min-w-0 flex-1 overflow-x-auto`,
  tabs are `shrink-0`, and the "+" button is a sibling outside the strip.
- **Release packaging.** Tauri's AppImage config has no desktop template, so the
  build script patches `FastSSH.desktop` in the AppDir (root **and**
  `usr/share/applications/`, which is the copy appimagetool uses) and re-runs
  linuxdeploy's appimage output plugin to re-pack, then renames the result to
  `FastSSH_1.0.0_amd64.AppImage`.

## 6. Data / settings schema

No field added or removed. Behaviour changes:

- `settings.json.openedHosts` is written on every debounced save while
  `restoreHosts` is on (previously only at quit).
- `hostsFolder` mode: the app no longer chmods an existing folder.
- A corrupt `settings.json` is renamed `settings.json.corrupt-<unix-ts>` and the
  reason is shown as a load warning (previously silent).

## 7. Dependencies added or changed in this stage

None in `package.json` or `Cargo.toml`. Build-time only: the jammy container
image (apt packages inside the image) and the linuxdeploy binary Tauri already
downloads, reused from the container's cache volume.

## 8. Deviations from the plan and why

- **Five bugs found by the new specs and fixed** (see §5). The plan's 12.1 asked
  for an error-handling review; three of those bugs were exactly "a caught error
  that the user could not read".
- **Perf task 12.4 measures disposal, not only RSS.** `ps -o rss` after closing
  20 tabs stayed above `before + 20 MB` because freed heap is not returned to the
  OS by glibc. The assertion is now "zero live xterm instances" (new
  `liveTerminals()` hook) plus "RSS below the peak", which proves disposal
  directly instead of through a memory heuristic.
- **restore-local's "list is cleared after restore" assertion replaced.** With
  tabs written on every save, clearing the list at restore is no longer the
  invariant that matters; the spec now asserts the file still names the tabs
  that are open, i.e. a crash restores reality rather than the run before.
- **The desktop entry is patched outside tauri.conf.** `AppImageConfig` has no
  `desktopTemplate`/`categories`, so the categories requirement (12.6) is met by
  patching the AppDir and re-packing in the build script.
- **`tauri-driver` cannot drive the AppImage.** `E2E_APP` pointed at the AppImage
  (through `tools/e2e-appimage.sh`) or at the extracted AppDir's `AppRun` fails
  in the WebdriverIO tauri service:
  `before() failed at stage="addTauriApi:single" — mode=binary
provider=external ... Cannot read properties of undefined (reading 'bind')`.
  The plan allows this ("if that doesn't work, those steps are [human] items"):
  the AppImage's launch is verified with screenshots and the static checks, the
  click-through is a `[human]` item in `docs/MANUAL_CHECKS.md`.
- **Full disk and 125 % scale** are `[human]`: the first needs `sudo` to mount a
  tmpfs (rule 10), the second needs the desktop's display settings.
- **eslint/prettier had to ignore the new build output** (`dist-release`,
  `src-tauri/target-jammy`); otherwise `npm run lint` tried to parse the packed
  JS inside the AppImage assets.

## 9. Verification

`E2E_ALL=1 tools/verify.sh full` on the debug build — every step OK:

| Step                             | Result                                                   |
| -------------------------------- | -------------------------------------------------------- |
| prettier / eslint / tsc          | OK                                                       |
| vitest                           | 381 tests, 50 files                                      |
| cargo fmt / clippy `-D warnings` | OK                                                       |
| cargo test                       | 143 passed                                               |
| real-files guard                 | OK (nothing under `~/.ssh`, `~/.config/easyssh` changed) |
| debug build + 8 s sandbox smoke  | OK                                                       |
| e2e, 22 specs                    | 119 tests, 0 failing                                     |

Per spec: a11y 7, backup 7, bookmarks 4, edge 15, gpg 4, library 11, perf 3,
persistence 3, preferences 6, probe 1, restore-local 3, shell 9, smoke 1,
ssh 10, sshconfig 3, states 3, tabs 5, terminal 7, tools-menu 2, tools 9,
warnings 1, window 5.

Required coverage (12.8) is present: `env_sanitize`, `settings` parsing,
`storage` atomic write + corrupt files + boot warnings, `utf8_chunker`,
`pty_manager`, `ssh_command`, `ssh_config` parse/import/export/backup, `gpg`,
`legacy_import`, `file_browser`, `naturalSort`, `hostUtils`, `tunnels`,
`sshConfigBlock`, `colors`, `fontSpec`, `promptWatcher`, `lastCommand`,
`slices`, and every e2e spec.

Release build (12.9/12.10):

```
bash tools/build-appimage-jammy.sh
dist-release/FastSSH_1.0.0_amd64.AppImage   78 MB
objdump -T .../usr/bin/fastssh | grep -o 'GLIBC_[0-9.]*' | sort -V | tail -1
  → GLIBC_2.34          (acceptance: <= 2.35)
grep -c __fastsshTest  usr/bin/fastssh      → 0
FastSSH.desktop: Name=FastSSH, Categories=Network;RemoteAccess;TerminalEmulator;
./tools/dev-sandbox.sh appimage            → window renders, screenshot
./tools/dev-sandbox.sh appimage-extract    → window renders, screenshot
```

Screenshots: `docs/screenshots/stage_12/appimage-fuse.png`,
`appimage-extract-and-run.png`, `window-min.png`, `window-maximized.png`.
No `panicked`, no `symbol lookup error` in either launch log; the status line
shows `FastSSH 1.0.0 - GNOME/wayland - DMABUF disabled: yes`.

## 10. Known issues / TODOs

- The in-AppImage UI pass (ssh/gpg/xdg-open/env inside it) is a `[human]` item,
  because of the driver limitation above. Everything that can be checked
  without a driver is checked.
- `probe.e2e.ts` is a Stage 3 scratch spec (1 test). It still passes; delete it
  if a later pass ever touches the suite layout.
- The container build reuses `~/.cache/fastssh-jammy`; delete that directory to
  force a fresh `npm ci`.
- The AppImage is not signed (12.11) and there is no auto-updater.
- The Stage 12 screenshots are full-screen captures (GNOME/Wayland, flameshot);
  they include the terminal behind the window, as in earlier stages.

## 11. Instructions for the next stage

There is no next stage in the plan: FastSSH is at 1.0.0 with all 12 stages done.
Remaining human actions:

1. `git tag v1.0.0` — the plan says ask the owner first (not tagged yet).
2. Publish `dist-release/FastSSH_1.0.0_amd64.AppImage`.
3. Work through `docs/MANUAL_CHECKS.md` (Stages 7-12 items), especially the
   in-AppImage click-through and the real `~/.ssh/config` sync.

## 12. Open questions for the human

- Tag `v1.0.0` now? (`git tag -a v1.0.0 -m "1.0.0"`)
- Publish the AppImage anywhere (GitHub release, AppImageHub)? Nothing is pushed
  by this project today.
- Signing: still declined? `appimagetool --sign` would need a GPG key and a
  public key users import; the README documents the consequence of rotating it.
- Should `probe.e2e.ts` be deleted, or kept as a smoke fixture?
