#!/usr/bin/env bash
# Runs FastSSH against the sandbox, never the owner's real files.
set -euo pipefail
T="${FASTSSH_TESTENV:-$HOME/fastssh-testenv}"
export FASTSSH_CONFIG_DIR="$T/config" FASTSSH_SSH_DIR="$T/ssh" FASTSSH_LEGACY_DIR="$T/legacy"
cd "$(dirname "$0")/.."
case "${1:-dev}" in
  dev)   exec npm run tauri dev ;;
  debug) exec ./src-tauri/target/debug/fastssh ;;
  appimage) exec ./src-tauri/target/release/bundle/appimage/FastSSH_*_amd64.AppImage ;;
esac
