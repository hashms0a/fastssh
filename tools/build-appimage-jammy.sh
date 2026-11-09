#!/usr/bin/env bash
# Task 12.9: build the release AppImage against Ubuntu 22.04's glibc (2.35) so
# it runs on 22.04 and later. The host's own target/ and node_modules are not
# used: the container gets a separate CARGO_TARGET_DIR and an npm volume.
#
#   tools/build-appimage-jammy.sh            build image + AppImage
#   tools/build-appimage-jammy.sh --image    only (re)build the image
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE=fastssh-appimage-jammy
NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
# The release name comes from src-tauri/tauri.conf.json, which is what tauri
# itself puts in the AppImage filename; nothing here hardcodes a version.
VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
OUT_APPIMAGE="FastSSH_${VERSION}_amd64.AppImage"

docker build --build-arg NODE_MAJOR="$NODE_MAJOR" -t "$IMAGE" tools/appimage-jammy
if [[ "${1:-}" == "--image" ]]; then echo "image $IMAGE ready"; exit 0; fi

# Named volumes are created root-owned, and the container runs as the host UID,
# so npm cannot write into them: use host directories instead.
CACHE="${FASTSSH_JAMMY_CACHE:-$HOME/.cache/fastssh-jammy}"
mkdir -p dist-release "$CACHE/home" "$CACHE/node_modules"
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp/home \
  -e CARGO_TARGET_DIR=/src/src-tauri/target-jammy \
  -e APPIMAGE_EXTRACT_AND_RUN=1 \
  -e NO_STRIP=true \
  -v "$PWD":/src \
  -v "$CACHE/node_modules:/src/node_modules" \
  -v "$CACHE/home:/tmp/home" \
  "$IMAGE" \
  bash -lc 'npm ci --no-audit --no-fund && NO_STRIP=true npm run tauri build -- --bundles appimage'

# Tauri writes an AppImage whose desktop entry has an empty Categories line.
# The desktop entry is what appimagelauncher installs, so fix it in the AppDir
# and re-pack with the linuxdeploy the build already downloaded (plan 12.6).
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp/home \
  -e APPIMAGE_EXTRACT_AND_RUN=1 \
  -e OUT_APPIMAGE="$OUT_APPIMAGE" \
  -v "$PWD":/src \
  -v "$CACHE/home:/tmp/home" \
  "$IMAGE" \
  bash -lc '
    set -euo pipefail
    APPDIR=/src/src-tauri/target-jammy/release/bundle/appimage/FastSSH.AppDir
    # appimagetool takes the root desktop entry from usr/share/applications, so
    # patch both copies.
    for f in "$APPDIR/FastSSH.desktop" "$APPDIR/usr/share/applications/FastSSH.desktop"; do
      sed -i "s|^Categories=.*|Categories=Network;RemoteAccess;TerminalEmulator;|" "$f"
      sed -i "s|^Comment=.*|Comment=SSH client with terminal tabs, a connection library, bookmarks and ssh_config sync.|" "$f"
    done
    LD=$(ls /tmp/home/.cache/tauri/linuxdeploy-*-x86_64.AppImage | head -1)
    cd "$(dirname "$APPDIR")"
    rm -f FastSSH-x86_64.AppImage
    "$LD" --appdir "$APPDIR" --output appimage
    mv -f FastSSH-x86_64.AppImage "$OUT_APPIMAGE"
  '

APPDIR=src-tauri/target-jammy/release/bundle/appimage
SHOTS=$(ls "$APPDIR"/*.AppImage 2>/dev/null || true)
if [[ -z "$SHOTS" ]]; then
  echo "no AppImage in $APPDIR" >&2
  exit 1
fi
cp -f "$APPDIR"/*.AppImage dist-release/
echo "copied:"
ls -lh dist-release/

# Smoke check: the packed binary must really load its embedded frontend. A
# frontend that was mid-write while tauri-build embedded the assets produces an
# AppImage whose webview shows "asset not found: index.html".
T="${FASTSSH_TESTENV:-$HOME/fastssh-testenv}"
SMOKE=/tmp/fastssh-appimage-smoke.log
FASTSSH_CONFIG_DIR="$T/config" FASTSSH_SSH_DIR="$T/ssh" FASTSSH_LEGACY_DIR="$T/legacy" \
  APPIMAGE_EXTRACT_AND_RUN=1 timeout 25 "./dist-release/$OUT_APPIMAGE" > "$SMOKE" 2>&1 &
sleep 14
pkill -x fastssh 2>/dev/null || true
wait 2>/dev/null || true
if grep -qE "asset not found|panicked|symbol lookup error" "$SMOKE"; then
  echo "AppImage smoke FAILED; last lines of $SMOKE:"
  grep -E "asset not found|panicked|symbol lookup error" "$SMOKE" | head -3
  exit 1
fi
echo "AppImage smoke: window loaded its assets (no asset-not-found, no panic)"

# The acceptance check (plan 12.9): the binary must not need a newer glibc
# than the AppImage ships. Extract the ELF and read its GLIBC symbol versions.
BIN=$(find "$APPDIR" -maxdepth 5 -name fastssh -type f | head -1)
objdump -T "$BIN" | grep -o 'GLIBC_[0-9.]*' | sort -V | tail -1
