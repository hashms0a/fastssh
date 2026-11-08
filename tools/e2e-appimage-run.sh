#!/usr/bin/env bash
# Launch the extracted AppImage AppRun for e2e (plan 12.10). APPIMAGE/APPDIR are
# exported so the app's env sanitizing is exercised the way it is when a user
# runs the AppImage.
T="${FASTSSH_TESTENV:-$HOME/fastssh-testenv}"
export FASTSSH_CONFIG_DIR="$T/config" FASTSSH_SSH_DIR="$T/ssh" FASTSSH_LEGACY_DIR="$T/legacy"
export APPIMAGE="$APPIMAGE_PATH" APPDIR="$APPDIR_PATH"
cd "$(dirname "$0")/.."
exec "$APPDIR_PATH/AppRun" "$@"
