# CLAUDE.md — FastSSH Specification (Tauri v2 + React + Rust)

## 1. Project Overview & Goal

You are tasked with building **FastSSH**, a modern desktop SSH connection manager and terminal multiplexer for Ubuntu and Kubuntu Linux, packaged specifically as a relocatable **AppImage**.

FastSSH is a clean-sheet rebuild of the unmaintained EasySSH (v1.7.9, Vala/GTK3/libgranite/VTE) project. It reproduces 100% of EasySSH's functional workflows while modernizing the stack to **Tauri v2 (Rust backend + React/TypeScript/Tailwind frontend + `@xterm/xterm` + `portable-pty`)**, fixing known bugs in the legacy codebase, and ensuring first-class compatibility across both **Ubuntu (GNOME / KWin)** and **Kubuntu (KDE Plasma / KWin Wayland)**.

**Core Principle:** Like the original EasySSH, **FastSSH** is a **GUI front-end and PTY manager for the host system's `/usr/bin/ssh` binary** (plus `/bin/sh` for local shells, `gpg` for optional data encryption, and `xdg-open` / `kioclient` for SFTP file browsing). It does **not** reimplement the SSH protocol in Rust.

## 2. Technology Stack

### Backend (`src-tauri/`)

- **Framework:** Tauri v2 (`tauri = "2"`)

- **PTY Management:** `portable-pty = "0.8"`

- **Serialization:** `serde = { version = "1.0", features = ["derive"] }`, `serde_json = "1.0"`

- **Async Runtime:** `tokio = { version = "1", features = ["full"] }`

- **File Watching / Atomic Writes:** `tempfile = "3"` (for atomic JSON/SSH config saves)

- **UUIDs & IDs:** `uuid = { version = "1", features = ["v4", "serde"] }`

### Frontend (`src/`)

- **Framework:** React 19 + TypeScript + Vite

- **Styling:** Tailwind CSS (configured with Ubuntu Yaru / KDE Breeze-inspired dark/light palette)

- **Icons:** `lucide-react`

- **State Management:** `zustand`

- **Terminal Emulator:**

  - `@xterm/xterm`

  - `@xterm/addon-fit`

  - `@xterm/addon-search`

  - `@xterm/addon-web-links`

## 3. CRITICAL: AppImage Environment Sanitization & KDE/Wayland Startup (Rust)

### 3.1 AppImage Environment Scrubber (`src-tauri/src/env_sanitize.rs`)

When packaged as an AppImage, the `AppRun` wrapper injects `LD_LIBRARY_PATH`, `LD_PRELOAD`, `PATH`, `XDG_DATA_DIRS`, `GSETTINGS_SCHEMA_DIR`, and `QT_PLUGIN_PATH` pointing inside the mounted SquashFS (`/tmp/.mount_FastSSXXXXXX/usr/...`).

**If you spawn `/usr/bin/ssh`, `/bin/sh`, `gpg`, `xdg-open`, or `kioclient` without sanitizing the environment, host binaries will load bundled AppImage shared libraries (like `libcrypto` or `libc`) and crash immediately with symbol lookup errors.**

You **MUST** implement `src-tauri/src/env_sanitize.rs` and route **every** `portable_pty::CommandBuilder` and `std::process::Command` through it:

```rust
// src-tauri/src/env_sanitize.rs
use portable_pty::CommandBuilder;
use std::collections::HashMap;
use std::env;
use std::process::Command;
use std::sync::OnceLock;

static CLEAN_ENV: OnceLock<HashMap<String, String>> = OnceLock::new();

/// Captures and reconstructs the host environment outside the AppImage container.
pub fn init_clean_environment() {
    CLEAN_ENV.get_or_init(|| {
        let mut env_map: HashMap<String, String> = env::vars().collect();

        // Detect if running inside an AppImage
        if env_map.contains_key("APPIMAGE") || env_map.contains_key("APPDIR") {
            let appdir = env_map.get("APPDIR").cloned().unwrap_or_default();

            // 1. Remove AppImage-specific variables
            for key in [
                "APPIMAGE",
                "APPDIR",
                "OWD",
                "ARGV0",
                "APPIMAGE_UUID",
                "LD_PRELOAD",
                "GDK_PIXBUF_MODULE_FILE",
                "GDK_PIXBUF_MODULEDIR",
                "GSETTINGS_SCHEMA_DIR",
                "GI_TYPELIB_PATH",
                "GTK_PATH",
                "GTK_EXE_PREFIX",
                "GTK_DATA_PREFIX",
                "QT_PLUGIN_PATH",
                "PERLLIB",
                "PYTHONHOME",
                "PYTHONPATH",
            ] {
                env_map.remove(key);
            }

            // 2. Restore or strip LD_LIBRARY_PATH
            if let Some(orig_ld) = env_map.remove("ORIGINAL_LD_LIBRARY_PATH") {
                if !orig_ld.is_empty() {
                    env_map.insert("LD_LIBRARY_PATH".to_string(), orig_ld);
                } else {
                    env_map.remove("LD_LIBRARY_PATH");
                }
            } else if let Some(current_ld) = env_map.get("LD_LIBRARY_PATH").cloned() {
                let cleaned = strip_appdir_paths(&current_ld, &appdir);
                if cleaned.is_empty() {
                    env_map.remove("LD_LIBRARY_PATH");
                } else {
                    env_map.insert("LD_LIBRARY_PATH".to_string(), cleaned);
                }
            }

            // 3. Clean PATH and XDG_DATA_DIRS from AppDir entries
            for var in ["PATH", "XDG_DATA_DIRS", "XDG_CONFIG_DIRS"] {
                if let Some(val) = env_map.get(var).cloned() {
                    let cleaned = strip_appdir_paths(&val, &appdir);
                    env_map.insert(var.to_string(), cleaned);
                }
            }
        }

        // Ensure standard terminal variables are set for SSH / shell sessions
        env_map.insert("TERM".to_string(), "xterm-256color".to_string());
        env_map.insert("COLORTERM".to_string(), "truecolor".to_string());

        env_map
    });
}

fn strip_appdir_paths(colon_separated: &str, appdir: &str) -> String {
    colon_separated
        .split(':')
        .filter(|segment| {
            !segment.is_empty()
                && (appdir.is_empty() || !segment.starts_with(appdir))
                && !segment.starts_with("/tmp/.mount_")
        })
        .collect::<Vec<_>>()
        .join(":")
}

/// Applies the sanitized host environment to a std::process::Command
pub fn sanitize_std_command(cmd: &mut Command) {
    let clean = CLEAN_ENV.get_or_init(|| {
        init_clean_environment();
        CLEAN_ENV.get().unwrap().clone()
    });
    cmd.env_clear();
    cmd.envs(clean);
}

/// Applies the sanitized host environment to a portable_pty::CommandBuilder
pub fn sanitize_pty_command(cmd: &mut CommandBuilder) {
    let clean = CLEAN_ENV.get_or_init(|| {
        init_clean_environment();
        CLEAN_ENV.get().unwrap().clone()
    });
    cmd.env_clear();
    for (k, v) in clean {
        cmd.env(k, v);
    }
}
```

### 3.2 Mandatory Startup Initialization (`src-tauri/src/main.rs`)

At the very top of `main()`, before starting the Tauri runtime, you **MUST** initialize the clean environment and disable WebKitGTK's DMA-BUF renderer to prevent blank white screens on Kubuntu (KDE Plasma Wayland + Nvidia/Mesa):

```rust
fn main() {
    // 1. Capture clean host environment before any mutations
    env_sanitize::init_clean_environment();

    // 2. Prevent WebKitGTK blank screen on KDE Plasma Wayland / Nvidia GPUs inside AppImage
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    fastssh_lib::run();
}
```

## 4. Kubuntu (KDE Plasma) & Ubuntu (GNOME) Compatibility Requirements

FastSSH must run out-of-the-box on both **Ubuntu (GNOME)** and **Kubuntu (KDE Plasma)** without requiring users to manually install GNOME libraries or wrestle with desktop-specific quirks. Implement these four cross-desktop guarantees:

1. **Self-Contained WebKitGTK Bundling:**
   - Fresh Kubuntu installations only ship Qt libraries by default and do not pre-install `libwebkit2gtk-4.1`.
   - Rely on Tauri's `linuxdeploy` GTK plugin during `tauri build --bundles appimage` so `libwebkit2gtk-4.1` and GTK3 are bundled inside the `.AppImage` container.
2. **SFTP in Dolphin (KIO) & Nautilus (GVFS) (`file_browser.rs`):**
   - On Ubuntu, `xdg-open sftp://user@host:port` mounts the remote host in Nautilus via GVFS. On Kubuntu, the default file manager is **Dolphin**, which uses KDE's KIO (`sftp://`).
   - In `src-tauri/src/file_browser.rs`, always sanitize the subprocess environment via `env_sanitize::sanitize_std_command` (so host Qt/KDE libraries used by `kioclient` or `dolphin` do not clash with the AppImage's bundled libraries).
   - Attempt `xdg-open sftp://user@host:port` first; if `XDG_CURRENT_DESKTOP` contains `KDE` and `xdg-open` fails, fall back to `kioclient exec sftp://user@host:port` or `dolphin sftp://user@host:port`.
3. **Desktop-Agnostic Encryption (GPG + KWallet / GNOME Keyring):**
   - By default, FastSSH uses symmetric **GPG file encryption** (`*.json.gpg` via `gpg --batch --yes --symmetric --armor --passphrase-fd 0`), which works identically on both Ubuntu and Kubuntu without depending on a specific desktop daemon.
   - If optional OS keychain storage is enabled for caching the master passphrase, target the standard FreeDesktop **Secret Service D-Bus API**, which is natively provided by both `gnome-keyring-daemon` on Ubuntu and **KWallet (`kwalletd6`)** on Kubuntu (Plasma 6).
4. **Wayland + Nvidia DMA-BUF Blank Screen Prevention:**
   - As specified in Section 3.2, set `WEBKIT_DISABLE_DMABUF_RENDERER=1` at startup in `main.rs` so WebKitGTK inside the AppImage renders cleanly under both KWin (Wayland/X11) on Kubuntu and Mutter on Ubuntu.

## 5. Repository Structure

```
fastssh/
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/                                  # React + TypeScript Frontend
│   ├── main.tsx
│   ├── App.tsx                           # MainWindow layout, global shortcuts, modals
│   ├── types/
│   │   └── models.ts                     # Host, Group, Account, Bookmark, Preferences, Tab
│   ├── store/
│   │   └── useAppStore.ts                # Zustand state (hosts, accounts, bookmarks, tabs, prefs)
│   ├── components/
│   │   ├── HeaderBar.tsx                 # New Conn, Local Shell, Bookmarks Popover, Search, Menu
│   │   ├── BookmarksPopover.tsx          # Search / Add / Run / Delete shell command bookmarks
│   │   ├── SearchToolbar.tsx             # Ctrl+Shift+F bar (Next, Prev, Cyclic, Case-insensitive)
│   │   ├── Sidebar/
│   │   │   ├── SourceListView.tsx        # Left pane toggle: Hosts (grouped) vs Accounts
│   │   │   └── HostRow.tsx               # Double-click connect, context menu, unread/tab count badge
│   │   ├── Workspace/
│   │   │   ├── WelcomeView.tsx           # Empty state for Hosts & Accounts
│   │   │   ├── ConnectionLanding.tsx     # Connect / Edit / Remove landing card when 0 tabs open
│   │   │   ├── HostNotebook.tsx          # Dynamic tab bar per-host + xterm.js instances
│   │   │   └── TerminalPane.tsx          # xterm.js wrapper, context menu, prompt watchers, search
│   │   ├── Editors/
│   │   │   ├── ConnectionEditor.tsx      # Add/Edit/Duplicate Host + Tunnels + Live ssh_config preview
│   │   │   ├── AccountEditor.tsx         # Add/Edit/Duplicate shared Account
│   │   │   └── ErrorRevealer.tsx         # Inline validation banner ("Name is already taken")
│   │   └── Modals/
│   │       ├── PreferencesModal.tsx      # General & Appearance settings
│   │       ├── FingerprintModal.tsx      # Yes/No prompt when SSH detects unknown host key
│   │       ├── ConnectionErrorModal.tsx  # Retry / Close dialog on timeout, refused, auth failure
│   │       └── GpgPasswordModal.tsx      # Passphrase prompt when encrypt-data is enabled
└── src-tauri/                            # Rust Backend
    ├── Cargo.toml
    ├── tauri.conf.json
    └── src/
        ├── main.rs
        ├── lib.rs
        ├── env_sanitize.rs               # AppImage environment scrubber (MANDATORY)
        ├── models.rs                     # Data models matching legacy JSON + Preferences
        ├── storage.rs                    # Atomic load/save for hosts.json, accounts.json, bookmarks.json, settings.json
        ├── gpg.rs                        # Symmetric GPG encryption/decryption via stdin (--passphrase-fd 0)
        ├── ssh_config.rs                 # Two-way ~/.ssh/config parser, generator, and .backup creator
        ├── pty_manager.rs                # portable-pty sessions, command builder, output streaming
        └── file_browser.rs               # Opens sftp://user@host:port in Nautilus (Ubuntu) or Dolphin (Kubuntu)
```

## 6. Data Models & Persistence Specification

All persistent files live in `hosts_folder` (default: `~/.config/fastssh/`; also offer a one-click import from `~/.config/easyssh/` if present). Unlike legacy EasySSH which used GSettings for app preferences and crashed in AppImages without compiled schemas, store preferences in `~/.config/fastssh/settings.json`.

### 6.1 `Host` (`hosts.json`)

Must remain backward-compatible with EasySSH's JSON fields, **strictly decoupled from UI widget references**:

```typescript
export interface TunnelRule {
  id: string;
  type: "local" | "remote"; // -L or -R
  sourcePort: number;
  destinationHost: string;
  destinationPort: number;
}

export interface Host {
  id: string;
  name: string; // Unique; spaces automatically converted to '-'
  group: string; // Category folder name in sidebar
  host: string; // Hostname or IP
  port: number; // Default 22
  username: string;
  password: string; // Used when account == ""
  identity_file: string; // Path to private key
  account: string; // Name of linked Account (if using shared Account)
  color: string; // Terminal background override (e.g. "rgb(0,0,0)" or "")
  font: string; // Terminal font override (e.g. "Monospace 11" or "")
  tunnels: string; // Comma-separated "-L 8080:localhost:80,-R ..." for legacy compatibility
  extra_arguments: string; // Verbatim extra ssh flags
  ssh_config: string; // Raw Host block for ~/.ssh/config sync
  local?: boolean; // True ONLY for built-in in-memory "Localhost" (never saved to disk)
}
```

### 6.2 `Account` (`accounts.json`)

```typescript
export interface Account {
  id: string;
  name: string; // Unique identifier
  username: string;
  password: string;
  identity_file: string;
}
```

_Rule:_ Editing an `Account` automatically updates the effective `username`, `password`, and `identity_file` of every `Host` whose `account` field matches `Account.name`.

### 6.3 `Bookmark` (`bookmarks.json`)

```typescript
export interface Bookmark {
  id: string;
  name: string;
  command: string; // Injected as `${command}\n` into the active terminal
}
```

### 6.4 `AppSettings` (`settings.json`)

Replaces the legacy GSettings schema:

```typescript
export interface OpenedHostState {
  hostName: string;
  tabCount: number;
}

export interface AppSettings {
  windowWidth: number; // default: 1100
  windowHeight: number; // default: 640
  windowMaximized: boolean; // default: false
  panelSize: number; // default: 240 (sidebar width in px)
  hostsFolder: string; // default: "~/.config/fastssh"
  openedHosts: OpenedHostState[]; // populated on quit when restoreHosts == true
  terminalBackgroundColor: string; // default: "#1e1e1e" or "rgb(0,0,0)"
  terminalFont: string; // default: "Ubuntu Mono, Noto Sans Mono, monospace"
  terminalFontSize: number; // default: 13
  useDarkTheme: boolean; // default: true
  restoreHosts: boolean; // default: false
  syncSshConfig: boolean; // default: false
  encryptData: boolean; // default: false
  scrollbackLines: number; // default: -1 (mapped to 50000 in xterm.js)
  audibleBell: boolean; // default: true
}
```

### 6.5 Atomic File Writes & Fixed GPG Encryption (`storage.rs` & `gpg.rs`)

1. **Atomic Save:** Never delete-then-create directly like legacy `write_data_to_file()`. Write to a `tempfile::NamedTempFile` in the same directory and `.persist()` (atomic POSIX `rename`) to `hosts.json`, `accounts.json`, `bookmarks.json`, or `settings.json`.

2. **GPG Encryption (`encryptData = true`):**

   - When enabled, data files are saved as `hosts.json.gpg`, `accounts.json.gpg`, and `bookmarks.json.gpg` (and unencrypted `.json` counterparts are securely removed).

   - **SECURITY FIX over Legacy EasySSH:** Legacy EasySSH passed `--passphrase <secret>` on the CLI command line, leaking the password in `ps aux`. You **MUST** invoke `gpg` using `--batch --yes --symmetric --armor --passphrase-fd 0` and pipe the passphrase over `stdin` (`Stdio::piped()`), using `env_sanitize::sanitize_std_command`.

## 7. Architecture & Lifecycle of a Connection

### 7.1 Host-Owned Notebooks (Crucial UX Pattern)

In FastSSH, **tabs belong to a `Host`, not globally to the window**:

- Clicking a `Host` in the left sidebar swaps that `Host`'s tab container (`HostNotebook`) into the right workspace pane.

- **IMPORTANT DOM REQUIREMENT:** Do **not** unmount `TerminalPane` (`xterm.js`) components when the user selects a different host in the sidebar! Unmounting destroys the xterm canvas buffer. Instead, render all active `HostNotebook` containers and toggle `className="hidden"` vs `className="flex flex-1"` based on `selectedHostName`.

- A built-in `Localhost` host in the `Local` group is injected at startup in memory (never written to `hosts.json`).

### 7.2 Connection Lifecycle & Command Generation

1. **Select Host:** If the host has `0` open tabs, show `ConnectionLanding` (with **Connect**, **Edit**, **Remove** buttons).

2. **Connect:** Triggered by clicking **Connect**, clicking the `+` tab button, or **double-clicking** the host row in the sidebar.

3. **PTY Spawn (`pty_manager.rs`):**

   - Frontend invokes `invoke('spawn_session', { tabId, host, syncSshConfig, cols, rows })`.

   - Backend creates a PTY via `portable_pty::native_pty_system().openpty(...)`.

   - Backend spawns `/bin/sh` (or `$SHELL`) inside the PTY using `env_sanitize::sanitize_pty_command`.

   - If `host.local == true`, it leaves the user in the local shell in `$HOME`.

   - If `host.local == false`, backend constructs and sends the SSH command into the PTY master:

     - **Standard Mode (`syncSshConfig == false`):**

       ```bash
       ssh <username>@<host> -p <port> [-i "<identity_file>"] [-L ... -R ...] [extra_arguments]
       ```

     - **Sync SSH Config Mode (`syncSshConfig == true`):**

       ```bash
       ssh <host.name>
       ```

4. **Stream Watcher & Prompt Heuristics (`TerminalPane.tsx` / `pty_manager.rs`):**
   Monitor incoming PTY output chunks for the following state transitions:

   - **Auto-Password Injection:** When output ends with `password:` (case-insensitive) and `passwordSent == false` and the host/account has a non-empty password, automatically write `${password}\n` to the PTY once and set `passwordSent = true`.

   - **Fingerprint Verification Dialog:** When output contains `(yes/no` (e.g. `Are you sure you want to continue connecting (yes/no/[fingerprint])?`), display `FingerprintModal` with **Yes** and **No** buttons. Clicking Yes writes `yes\n` to the PTY; clicking No writes `no\n`.

   - **Connection Errors:**

     - If output contains `Connection refused` or `No route to host`, show `ConnectionErrorModal` with **Retry** and **Close**.

     - If output contains `Connection timed out`, `Broken pipe`, `Connection closed`, or `Permission denied, please try again.`, show `ConnectionErrorModal` with **Retry** and **Close**.

   - **Session Login & Clean Logout:** Once shell prompt (`:~$`, `:~#`, or `]$`) is seen, mark `loggedIn = true`. When the shell exits or prints `logout` after `loggedIn == true`, automatically close the tab. If it was the last tab for that host, display `ConnectionLanding`.

### 7.3 Terminal Niceties (`TerminalPane.tsx`)

- **Per-Connection Styling:** Apply `host.color` and `host.font` if non-empty; otherwise fall back to `settings.terminalBackgroundColor` and `settings.terminalFont`.

- **Unread Output Badges:** If a PTY emits output while its tab or host is not focused, mark the tab and the sidebar `HostRow` with an unread indicator dot/icon, and display the open tab count badge on `HostRow`. Focusing the tab clears the unread badge.

- **Track Last Command Output (`Alt+C` and `Alt+Up`):**

  - Record the buffer line index whenever the user presses `Enter` in the terminal (`lastCommandStartRow`).

  - **Copy Last Output (`Alt+C`):** Extracts text from `lastCommandStartRow` to the current cursor row from `xterm.buffer.active` and copies it to the clipboard.

  - **Scroll to Last Command (`Alt+Up`):** Calls `xterm.scrollToLine(lastCommandStartRow)`.

- **Show in File Browser (`Ctrl+Shift+E` or Context Menu):**

  - Invokes Rust command `open_sftp_file_browser(username, host, port)`.

  - Rust constructs `sftp://username@host:port` and executes `xdg-open` (with KDE `kioclient exec` / `dolphin` fallback) using `env_sanitize::sanitize_std_command` so Ubuntu's Nautilus or Kubuntu's Dolphin mounts the remote share.

## 8. Two-Way `~/.ssh/config` Sync (`ssh_config.rs`)

_(Note: Legacy EasySSH had an inverted null-check bug `if (file != null) return;` in `load_ssh_config()` that broke imports. Implement this properly!)_

1. **Backup First:** When the user enables **Sync SSH Config** in Preferences, immediately copy `~/.ssh/config` (if it exists) to `~/.ssh/config.backup` before modifying anything.

2. **Import (`load_ssh_config`):**

   - Parse `~/.ssh/config` `Host` blocks.

   - Skip wildcard blocks (`Host *`).

   - Place imported hosts that don't already exist in `hosts.json` into the `"SSHConfig"` group, mapping `HostName` → `host`, `User` → `username`, `Port` → `port`, `IdentityFile` → `identity_file`, and storing the raw block in `ssh_config`.

3. **Export (`save_ssh_config`):**

   - Whenever `syncSshConfig == true` and hosts are saved, regenerate `~/.ssh/config` atomically from the host library.

   - If a host has a custom `ssh_config` block edited in `ConnectionEditor`, write that block; otherwise generate:

     ```sshconfig
     Host <name>
         HostName <host>
         User <username>
         Port <port>
         IdentityFile <identity_file>
     ```

4. **Live Editor Sync:** Inside `ConnectionEditor` -> **Advanced**, provide a live `ssh_config` textarea that updates dynamically as the user edits Name, Host, Port, Username, or Identity File, while also allowing raw manual additions.

## 9. Keyboard Shortcuts & Actions Matrix

Register these shortcuts on the main window (`App.tsx`), fixing the duplicate action ID bug from legacy `MainWindow.vala`:

| Shortcut                               | Action                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `Ctrl+Q`                               | Save session state (`openedHosts` if `restoreHosts` is on) and quit app    |
| `Ctrl+Shift+T`                         | Open a new terminal tab for the currently selected host                    |
| `Ctrl+Shift+W`                         | Close the currently focused terminal tab                                   |
| `Ctrl+Shift+Left` / `Ctrl+Shift+Right` | Switch to previous / next tab in the active host's notebook                |
| `Ctrl+Shift+C` / `Ctrl+Shift+V`        | Copy selection / Paste from clipboard into active terminal                 |
| `Ctrl+Shift+A`                         | Select all text in the active terminal                                     |
| `Ctrl+Shift+F`                         | Toggle `SearchToolbar` (`Ctrl+G` Next, `Ctrl+Shift+G` Previous while open) |
| `Ctrl+Shift+E`                         | Show current SSH connection in Ubuntu/Kubuntu File Manager (`sftp://...`)  |
| `Alt+C`                                | Copy last command output to clipboard                                      |
| `Alt+Up`                               | Scroll terminal buffer to the start of the last executed command           |
| `F11`                                  | Toggle fullscreen window                                                   |

## 10. Tauri v2 Configuration & AppImage Packaging

### 10.1 `src-tauri/tauri.conf.json`

Ensure the product name (`FastSSH`), bundle identifier, window defaults, and AppImage target are configured as follows:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "FastSSH",
  "version": "1.0.0",
  "identifier": "io.github.fastssh.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "FastSSH",
        "width": 1100,
        "height": 640,
        "minWidth": 800,
        "minHeight": 500,
        "resizable": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["appimage"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"],
    "linux": {
      "appimage": {
        "bundleMediaFramework": false
      }
    }
  }
}
```

### 10.2 Ubuntu / Kubuntu Build & Packaging Commands

Before building on Ubuntu or Kubuntu (build on 22.04 LTS for maximum `glibc` compatibility across 22.04, 24.04, and 26.04 LTS), verify system dependencies:

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  xdg-utils \
  openssh-client \
  gnupg \
  libfuse2
```

Build the AppImage via Tauri CLI:

```bash
npm install
npm run tauri build -- --bundles appimage
```

The self-contained AppImage is output to:
`src-tauri/target/release/bundle/appimage/FastSSH_1.0.0_amd64.AppImage`

_(Note for End Users on Ubuntu/Kubuntu 22.04+)_: If `libfuse2t64` is not installed on the target machine, the AppImage can also be run directly without FUSE via `./FastSSH_1.0.0_amd64.AppImage --appimage-extract-and-run`.

## 11. Step-by-Step Implementation Order for the AI Agent

Execute the build in these sequential milestones, running `cargo check` and `npm run build` at the end of each step:

1. **Milestone 1 — Scaffolding, Environment Sanitizer & Wayland DMA-BUF Fix:**

   - Initialize the Vite + React + TypeScript + Tailwind frontend and `src-tauri` Rust project named `fastssh`.

   - Implement `src-tauri/src/env_sanitize.rs`, configure `WEBKIT_DISABLE_DMABUF_RENDERER=1` in `main.rs`, and write unit tests verifying that `APPDIR`, `LD_LIBRARY_PATH`, and `/tmp/.mount_*` entries in `PATH` are cleanly stripped.

2. **Milestone 2 — Data Layer, GPG & `~/.ssh/config` Sync:**

   - Implement `models.rs`, `storage.rs` (defaulting to `~/.config/fastssh` with legacy `~/.config/easyssh` import support), `gpg.rs` (using `--passphrase-fd 0`), and `ssh_config.rs` (fixing the legacy `load_ssh_config` bug).

   - Expose Tauri commands for loading/saving hosts, accounts, bookmarks, and preferences.

3. **Milestone 3 — PTY Manager & Cross-Desktop SFTP Launcher:**

   - Implement `pty_manager.rs` using `portable_pty` and `env_sanitize::sanitize_pty_command`.

   - Stream PTY output to the frontend via Tauri events (`pty-output-<tabId>`, `pty-exit-<tabId>`).

   - Implement `file_browser.rs` (`sftp://` launcher via sanitized `xdg-open` with KDE `kioclient exec` / `dolphin` fallback).

4. **Milestone 4 — Frontend UI & Editors:**

   - Build `HeaderBar`, `SourceListView` (Hosts/Accounts toggle, collapsible groups, badges), `ConnectionEditor` (with Tunnels list and live `ssh_config` preview), `AccountEditor`, `BookmarksPopover`, and `PreferencesModal`.

5. **Milestone 5 — Terminal Multiplexer & Prompt Heuristics:**

   - Build `HostNotebook` and `TerminalPane` with `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-search`, and `@xterm/addon-web-links`.

   - Wire up auto-password injection, `FingerprintModal`, `ConnectionErrorModal`, `SearchToolbar`, and `Alt+C` / `Alt+Up` command output tracking.

6. **Milestone 6 — Verification & AppImage Build:**

   - Run `cargo test` and `npm run build`.

   - Build the AppImage (`npm run tauri build -- --bundles appimage`) and verify it launches cleanly.
