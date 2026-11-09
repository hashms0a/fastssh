#!/usr/bin/env bash
# Runs FastSSH against the sandbox, never the owner's real files.
set -euo pipefail
T="${FASTSSH_TESTENV:-$HOME/fastssh-testenv}"
export FASTSSH_CONFIG_DIR="$T/config" FASTSSH_SSH_DIR="$T/ssh" FASTSSH_LEGACY_DIR="$T/legacy"
cd "$(dirname "$0")/.."
# The AppImage to run: the newest jammy build in dist-release/, else the host bundle.
appimage_path() {
  if [[ -n "${FASTSSH_APPIMAGE:-}" ]]; then echo "$FASTSSH_APPIMAGE"; return; fi
  local found
  found=$(ls -1t ./dist-release/FastSSH_*_amd64.AppImage 2>/dev/null | head -1)
  if [[ -n "$found" ]]; then echo "$found"; return; fi
  ls -1t ./src-tauri/target/release/bundle/appimage/FastSSH_*_amd64.AppImage 2>/dev/null | head -1
}

case "${1:-dev}" in
  dev)   exec npm run tauri dev ;;
  debug) exec ./src-tauri/target/debug/fastssh ;;
  appimage)
    app=() ; [[ -n "${FASTSSH_APPIMAGE_FLAGS:-}" ]] && app+=("$FASTSSH_APPIMAGE_FLAGS")
    exec "$(appimage_path)" "${app[@]}" ;;
  appimage-extract) exec "$(appimage_path)" --appimage-extract-and-run ;;
esac
