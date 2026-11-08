#!/usr/bin/env bash
# E2E_APP target for the release AppImage (plan 12.10): the specs drive the
# AppImage through the same sandbox as the debug binary. extract-and-run so the
# run needs no FUSE.
cd "$(dirname "$0")/.."
exec ./tools/dev-sandbox.sh appimage-extract
