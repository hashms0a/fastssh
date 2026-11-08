# Handoff - Stage 00: Environment audit, sandbox fixtures, project skeleton

- Date: 2026-11-07
- Status: Complete
- Next stage: 01: Data model and persistence

## 1. Summary

Audited the machine (Ubuntu 26.04 GNOME/Wayland, AMD GPU), installed the
approved system packages, created the sandbox fixtures at ~/fastssh-testenv,
built and started the fastssh-sshd container, and passed the A.12 toolchain
smoke test (template window rendered, AppImage produced). Scaffolded the
Tauri v2 + React 19 project, implemented env_sanitize (6 tests) + paths.rs
(3 tests) + get_runtime_info, wired the dark-theme placeholder UI (header
bar, sidebar, runtime info line), and set up vitest + eslint + prettier +
WebdriverIO e2e. All rule-3 commands pass; the e2e smoke spec passes.

## 2. Environment

- OS / desktop / session / GPU: **Ubuntu 26.04.1 LTS (Resolute)**, kernel
  7.0.0-42-generic, x86_64, 16 cores, 28 GiB RAM, 846 GB free on `/` (home).
  **GNOME Shell 50.1**, session type **wayland** (XDG_CURRENT_DESKTOP
  `ubuntu:GNOME`, DESKTOP_SESSION `ubuntu`). GPU: **AMD Radeon 680M
  (Rembrandt)** — not NVIDIA, so the DMABUF fix cannot be verified against
  NVIDIA here; "verify on NVIDIA + Wayland" goes to MANUAL_CHECKS (Stage 12).
- Node v26.13.0 / npm 11.20.0 (install method: tarball under `/opt/node`,
  symlinked to `/usr/local/bin`; NOT apt/nvm/snap). Upgrade path: replace
  the tarball. Node >= 20, no upgrade needed.
- rustc / cargo **1.99.1** via **rustup** 1.29.2 (`~/.cargo/bin` on PATH;
  rustfmt + clippy components present). Install method: rustup.
- Tauri CLI `@tauri-apps/cli` **2.12.4** / `@tauri-apps/api` **2.12.4** /
  Rust crate `tauri` **2.12.5**.
- System packages (installed in Stage 0A unless noted):
  libwebkit2gtk-4.1-dev 2.52.6 (pkg-config webkit2gtk-4.1,
  javascriptcoregtk-4.1 = 2.52.6; libsoup-3.0 = 3.6.6), build-essential
  12.12, curl 8.18, wget 1.25, file 5.46, libxdo-dev 3.20160805,
  libssl-dev 3.5.5, libayatana-appindicator3-dev 0.5.94, librsvg2-dev
  2.61.3, patchelf 0.18, xdg-utils 1.2.1, openssh-client 10.2p1,
  gnupg 2.4.8 (>= 2.2.7, supports --no-symkey-cache), libfuse2t64 2.9.9
  (on 26.04 `libfuse2` itself is not packaged; libfuse2t64 is the one
  installed), webkitgtk-webdriver 2.52.6 (provides `/usr/bin/WebKitWebDriver`;
  the old `webkit2gtk-driver` package name has no candidate on 26.04),
  gnome-screenshot 41.0, flameshot 13.3 (preinstalled).
- Tools: gpg 2.4.8 ✓, ssh 10.2p1 ✓, xdg-open 1.2.1 ✓, kioclient + kde-open
  present (Dolphin itself absent - KDE path is a manual check), nautilus +
  gio present (**GNOME/GVFS sftp path is the one testable here**), no
  dolphin. Secret Service: gnome-keyring-daemon on the session bus ✓.
  WebKitWebDriver ✓, tauri-driver 2.1.0 (`~/.cargo/bin`, cargo install
  --locked) ✓.
- Screenshot helper: `tools/screenshot.sh` — GNOME 50 + Wayland quirk:
  gnome-screenshot's D-Bus interface is broken on this build (falls back to
  X11, prints Gdk warnings, often hangs); grim lacks wlr-screencopy on
  GNOME. **flameshot v13 works**; the script tries flameshot first
  ("full" = all monitors, "window" = primary screen; flameshot 13 has no
  active-window mode - plan A.7 accepts full-screen on GNOME). Verified by
  opening the PNG.
- Sandbox: `~/fastssh-testenv` — config/ (700, .hosts.json.swp present),
  ssh/ (700, id_test, "key dir/id_space", config fixture with preamble,
  multi-alias web1/web-alias, Key=Value db10, quoted path db2, bastion
  ProxyJump, !negated + *.corp, Match, Include, "Host *"; known_hosts
  empty after the KEY-OK check), legacy/ (hosts/accounts/bookmarks in the
  EasySSH kebab-case shape), bad/ (corrupt hosts.json, empty accounts.json,
  wrong-type bookmarks.json, bad settings.json, fake hosts.json.gpg),
  big/hosts.json (2000 hosts / 50 groups), sshhd/ (Dockerfile, id_test.pub,
  big.txt 68 MB).
- Container: image `fastssh-test-sshd:latest` built from
  tools/test-sshd/Dockerfile; container **fastssh-sshd Up**, 127.0.0.1:2222
  -> 22. KEY-OK printed (ed25519 key auth). tester password
  "fastssh-test-pass" (throwaway).
- Machine changes (all approved by owner this session):
  1. `sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev
libxdo-dev libayatana-appindicator3-dev librsvg2-dev
webkitgtk-webdriver gnome-screenshot`
  2. `cargo install tauri-driver --locked` (v2.1.0 -> ~/.cargo/bin)
  3. `docker build -t fastssh-test-sshd ~/fastssh-testenv/sshd` (pulled
     ubuntu:24.04)
- Docker: 29.1.3, works without sudo (user in `docker` group). Podman absent.
- Git 2.53.0. Global user.name/email are unset; repo-local identity set to
  `FastSSH Dev <dev@fastssh.local>` (placeholder - owner may change; see
  section 12).

## 3. Requirements status

| Req              | Description             | Status      | Notes                                                                                                                                                                                             |
| ---------------- | ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R20              | Env sanitizing + DMABUF | Partial     | env_sanitize.rs in place + 6 unit tests; main.rs sets WEBKIT_DISABLE_DMABUF_RENDERER=1 when unset; verified in sandbox (yes by default, no with =0). Full R20 = all children use it (Stages 4/7). |
| R1-R19, R21, R22 | All other requirements  | Not started | Stages 1-12.                                                                                                                                                                                      |

## 4. Files created / modified

- `.gitignore` - modified (added src-tauri/target/, _.AppImage, .env_, coverage/, e2e/.tmp/, docs/screenshots/**/tmp_*)
- `CLAUDE.md` - created (pointer: plan + newest handoff; rules 2/3/10/11 verbatim; plan wins over spec on deviations)
- `docs/BUILD_PLAN.txt` - created (copy of FASTSSH_BUILD_PLAN.txt)
- `docs/SPEC.md` - created (copy of fastssh_tauri_v2_agent_specification.md)
- `docs/handoff/HANDOFF_STAGE_00.md` - this file
- `(screenshot withheld from the public repo: it showed the developer's local username and hostname)` - created (A.12 template smoke window)
- `(screenshot withheld from the public repo: it showed the developer's local username and hostname)` - created (FastSSH debug build in sandbox, DMABUF yes)
- `(screenshot withheld from the public repo: it showed the developer's local username and hostname)` - created (WEBKIT_DISABLE_DMABUF_RENDERER=0 -> "no")
- `docs/screenshots/stage_00/e2e-smoke.png` - created (e2e browser.saveScreenshot)
- `tools/make_fixtures.sh`, `tools/screenshot.sh`, `tools/dev-sandbox.sh` - created (+x)
- `tools/test-sshd/Dockerfile` - created (same as sandbox sshd image)
- `e2e/wdio.conf.ts`, `e2e/helpers.ts`, `e2e/specs/smoke.e2e.ts` - created
- `index.html` - modified (title FastSSH)
- `package.json` - modified (scripts test/lint/typecheck/format/format:check/e2e)
- `eslint.config.js`, `.prettierrc.json` - created
- `tsconfig.json` - modified (noUncheckedIndexedAccess)
- `vite.config.ts` - modified (tailwind plugin + vitest config)
- `src/index.css` - created (tailwind import, @custom-variant dark, theme CSS variables)
- `src/main.tsx` - created; `src/App.tsx` - replaced template
- `src/lib/strings.ts`, `src/lib/strings.test.ts`, `src/lib/log.ts`, `src/lib/ipc.ts` - created
- `src/test/setup.ts` - created (jest-dom + mockIPC)
- `src-tauri/tauri.conf.json` - modified (FastSSH, 1.0.0, window spec 10.1 + visible:false, bundle appimage)
- `src-tauri/capabilities/default.json` - modified (plan reference block)
- `src-tauri/src/env_sanitize.rs`, `paths.rs` - created
- `src-tauri/src/commands/mod.rs`, `commands/system.rs` - created (get_runtime_info)
- `src-tauri/src/lib.rs` - replaced template (plugins, force-show 5s, command)
- `src-tauri/src/main.rs` - modified (clean env init + DMABUF var)
- `src-tauri/Cargo.toml` - modified (added crates)

## 5. Architecture notes

- `env_sanitize` keeps the clean environment in a `OnceLock` captured in
  `main()` BEFORE the DMABUF variable is set, so PTY children do not
  inherit it.
- The bin and lib share one copy of `env_sanitize` (bin uses
  `fastssh_lib::env_sanitize`); declaring `mod env_sanitize` in main.rs
  too would duplicate-compile it and trigger dead-code warnings.
- `get_runtime_info` reports the FIRST element of XDG_CURRENT_DESKTOP
  (shows "ubuntu" on this box; the machine profile records it as
  `ubuntu:GNOME`). Session shows "wayland".
- Window starts hidden (tauri.conf visible:false); the frontend calls
  show() after mount; Rust force-shows after 5 s as the JS-crash safety
  net.
- Theme: dark class on `<html>` + CSS variables (--bg, --bg-alt, --fg,
  --muted, --accent, --border, --danger) in index.css. Stage 2 refines.

## 6. Data/settings schema

- No data model yet (Stage 1). Sandbox config/ contains only the hidden
  `.hosts.json.swp` fixture.

## 7. Dependencies (resolved versions)

- npm: react 19.3.1, react-dom 19.3.1, zustand 5.1.0, lucide-react 1.70.0,
  @xterm/xterm 6.0.0, @xterm/addon-fit 0.11.0, @xterm/addon-search 0.16.0,
  @xterm/addon-web-links 0.12.0, @tauri-apps/api 2.12.4,
  @tauri-apps/plugin-clipboard-manager 2.5.0, @tauri-apps/plugin-dialog
  2.8.4, @tauri-apps/plugin-log 2.10.1, tailwindcss 4.3.5,
  @tailwindcss/vite 4.3.5, vite 8.3.6, vitest 5.1.0, typescript 6.0.3,
  @testing-library/react 16.3.3, @testing-library/jest-dom 7.0.1,
  @testing-library/user-event 14.6.8, eslint 10.14.0,
  typescript-eslint 8.72.1, eslint-plugin-react-hooks 7.1.1,
  prettier 3.9.10, @wdio/cli 10.2.0, @wdio/local-runner 10.2.0,
  @wdio/mocha-framework 10.2.0, @wdio/spec-reporter 10.2.0,
  @wdio/tauri-service 1.5.1, tsx 4.23.15, jsdom 31.0.0
- cargo: tauri 2.12.5, tauri-plugin-log 2.x, tauri-plugin-clipboard-manager
  2.x, tauri-plugin-dialog 2.x, portable-pty **0.9.0**, serde 1.0.229,
  serde_json 1.0.154, tempfile 3.27.0, tokio 1.54.1, uuid 1.29.1,
  dirs 7.0.0, log 0.4.35

## 8. Deviations from the plan and why

- `env_sanitize.rs` uses the plan's reference implementation (pure
  `build_clean_env`), which fixes the spec's reentrant
  `init_clean_environment()` inside `OnceLock::get_or_init` (may deadlock).
  As planned, recorded per 0B.7.
- portable-pty resolved to **0.9.0** (spec floor 0.8). Keep the newer
  major; APIs used match the reference.
- WebKitWebDriver on Ubuntu 26.04 comes from the **`webkitgtk-webdriver`**
  apt package (the plan's `webkit2gtk-driver` has no candidate on 26.04).
- FUSE: only `libfuse2t64` exists on 26.04 (plan's "only one of them is
  needed" applies; `libfuse2` recorded as not-packaged).
- e2e stack: current Tauri docs recommend `@wdio/tauri-service` (WebdriverIO
  > = 9) instead of hand-spawning tauri-driver in beforeSession. Using the
  > service with `driverProvider: 'external'` (tauri-driver + WebKitWebDriver
  > as the plan prescribes). The embedded provider needs
  > tauri-plugin-wdio; not used.
- `paths.rs` tests use `unsafe { set_var/remove_var }` (edition 2024,
  Cargo.toml edition = "2024") guarded by a test mutex.
- `get_runtime_info` maps Rust snake_case to camelCase in
  `src/lib/ipc.ts` (`dmabufDisabled`), matching the plan's IPC convention.
- A.13 KEY-OK check used `-o StrictHostKeyChecking=accept-new` (the
  plan's plain ssh + "answer yes" prompt is awkward under a piped stdin).
- create-tauri-app `--force` wiped the pre-existing docs/ folder; the two
  docs were restored (plan copied, spec rewritten verbatim from the
  complete file read).
- `package.json` "version" stays 0.1.0 (template); tauri.conf.json carries
  1.0.0 (spec 10.1). Stage 12 aligns if needed.

## 9. Verification

| Command                                   | Result                                                               |
| ----------------------------------------- | -------------------------------------------------------------------- |
| npm install                               | pass (lockfile stable, no churn)                                     |
| npm run format                            | pass                                                                 |
| npm run lint                              | pass (0 errors, 0 warnings)                                          |
| npm run typecheck                         | pass                                                                 |
| npm test                                  | 2 passed (1 file: strings)                                           |
| cargo fmt --check                         | pass                                                                 |
| cargo clippy --all-targets -- -D warnings | pass                                                                 |
| cargo test                                | 9 passed (6 env_sanitize + 3 paths)                                  |
| tauri build --debug --no-bundle           | pass                                                                 |
| npm run e2e                               | 1 passed (smoke: title FastSSH, header-bar exists, screenshot saved) |

- A.12 smoke test: template debug binary showed a rendered "Welcome to
  Tauri + React" window ((screenshot withheld from the public repo: it showed the developer's local username and hostname), copied from
  ~/fastssh-testenv/stage00-smoke.png) and
  `NO_STRIP=true npm run tauri build -- --bundles appimage` produced
  smoke_0.1.0_amd64.AppImage (84 MiB). NO_STRIP was needed; not tested
  without it. Smoke folder removed after the test (caches kept).
- A.13: fastssh-sshd Up, KEY-OK printed, sandbox known_hosts reset to empty
  (so Stage 5 can show the fingerprint modal).
- Screenshots:
  - (screenshot withheld from the public repo: it showed the developer's local username and hostname) - A.12 template window, rendered (Tauri+React logos, greet form).
  - (screenshot withheld from the public repo: it showed the developer's local username and hostname) - FastSSH debug binary via tools/dev-sandbox.sh: title "FastSSH", header bar "FastSSH", empty sidebar, workspace line "FastSSH 1.0.0 - ubuntu/wayland - AppImage: no - DMABUF disabled: yes". Not blank.
  - (screenshot withheld from the public repo: it showed the developer's local username and hostname) - same with WEBKIT_DISABLE_DMABUF_RENDERER=0 exported: line shows "DMABUF disabled: no" (existing value respected).
  - docs/screenshots/stage_00/e2e-smoke.png - WebdriverIO saveScreenshot of the webview.
- Env-sanitize grep: `Command::new`/`CommandBuilder::new` currently appear
  only inside env_sanitize's API (no subprocess spawns yet); every future
  spawn must call sanitize_* (checked per stage).
- Owner's real files untouched: `ls -la --time-style=full-iso ~/.ssh
~/.config/easyssh` identical before/after (diff clean):
  ~/.ssh/authorized_keys 600, ~/.config/easyssh/hosts.json 664,
  ~/.config/fastssh absent.

## 10. Known issues / TODOs

- `flameshot screen` captures the primary screen, not the active window
  (flameshot 13 limitation) - acceptable per plan A.7; e2e
  browser.saveScreenshot is the webview-only alternative.
- arboard logs a harmless Wayland clipboard WARN on startup (falls back to
  X11 clipboard).
- The runtime line shows desktop "ubuntu" (first element of
  XDG_CURRENT_DESKTOP=ubuntu:GNOME). Fine for the machine profile
  comparison; consider mapping to "GNOME" in Stage 2.
- `npm install` prints an install-scripts audit notice (esbuild/vscode-
  jsonc-language-features postinstalls); approved implicitly, no impact.
- Check on a real device: NVIDIA + Wayland DMABUF behaviour; X11 session
  under GNOME; Dolphin/KIO sftp path (this machine has kioclient but no
  dolphin); KWallet prompt; AppImage on clean 22.04/24.04.
- Git identity is the placeholder `FastSSH Dev <dev@fastssh.local>`
  (repo-local); global git config is unset.

## 11. Instructions for the next stage

- First files to open: src-tauri/src/models.rs (create), storage.rs
  (create), settings.rs (create), commands/library.rs (create),
  src/store/ (create), src/types/models.ts (create); plan STAGE 1 + the
  reference code in section 5.
- Pitfalls noticed:
  - Start the container first: `docker start fastssh-sshd`.
  - e2e runs the DEBUG binary - always
    `npm run tauri build -- --debug --no-bundle` before `npm run e2e`.
  - `pkill -f 'target/debug/fastssh'` also matches wrapper shells;
    `pkill -x fastssh` is safer.
  - cargo add resolved portable-pty 0.9: `child.clone_killer()` API is
    unchanged; verify when wiring pty_manager.
  - Load fixtures: `cp ~/fastssh-testenv/legacy/*.json ~/fastssh-testenv/config/`.

## 12. Open questions for the human

- Git identity: keep `FastSSH Dev <dev@fastssh.local>` (repo-local) or set
  your own via `git config user.name/user.email` in fastssh/?
  FastSSH Dev <dev@fastssh.local>
- The runtime line shows "ubuntu/wayland" (from XDG_CURRENT_DESKTOP).
  Show "GNOME/wayland" instead in Stage 2? Cosmetic; plan's acceptance
  example says "GNOME/wayland".
  Show "GNOME/wayland" instead in Stage 2
