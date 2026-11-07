#!/usr/bin/env bash
# Usage: screenshot.sh <out.png> [window|full]
# GNOME 50/Wayland notes: gnome-screenshot's D-Bus path is broken on this
# machine (falls back to X11, then hangs); grim lacks wlr-screencopy on GNOME.
# flameshot v13 works: "full" = all monitors, "window" = primary screen
# (flameshot 13 has no active-window mode; full-screen capture is acceptable
# per plan A.7).
set -euo pipefail
out="$1"; mode="${2:-window}"
mkdir -p "$(dirname "$out")"
if command -v flameshot >/dev/null; then
  if [[ $mode == full ]]; then flameshot full -p "$out" 2>/dev/null
  else flameshot screen -p "$out" 2>/dev/null; fi
elif command -v gnome-screenshot >/dev/null; then
  if [[ $mode == full ]]; then gnome-screenshot -f "$out"; else gnome-screenshot -w -f "$out"; fi
elif command -v grim >/dev/null; then
  grim "$out"
else
  echo "No screenshot tool available. Use e2e browser.saveScreenshot()." >&2
  exit 2
fi
test -s "$out" && echo "saved $out"
