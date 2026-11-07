#!/usr/bin/env bash
# Debug binary for manual runs and e2e. `tauri build --debug` normally runs
# `vite build` in PRODUCTION mode (import.meta.env.DEV is false). Here Vite
# runs in mode "e2e", so the window.__fastsshTest hook is included.
# Release builds never use this script.
set -euo pipefail
cd "$(dirname "$0")/.."
exec npm run tauri build -- --debug --no-bundle \
  --config '{"build":{"beforeBuildCommand":"npm run build -- --mode e2e"}}'
