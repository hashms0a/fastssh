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

docker build --build-arg NODE_MAJOR="$NODE_MAJOR" -t "$IMAGE" tools/appimage-jammy
if [[ "${1:-}" == "--image" ]]; then echo "image $IMAGE ready"; exit 0; fi

mkdir -p dist-release
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp/home \
  -e CARGO_TARGET_DIR=/src/src-tauri/target-jammy \
  -e APPIMAGE_EXTRACT_AND_RUN=1 \
  -e NO_STRIP=true \
  -v "$PWD":/src \
  -v fastssh-jammy-node-modules:/src/node_modules \
  -v fastssh-jammy-home:/tmp/home \
  "$IMAGE" \
  bash -lc 'npm ci --no-audit --no-fund && NO_STRIP=true npm run tauri build -- --bundles appimage'

APPDIR=src-tauri/target-jammy/release/bundle/appimage
SHOTS=$(ls "$APPDIR"/*.AppImage 2>/dev/null || true)
if [[ -z "$SHOTS" ]]; then
  echo "no AppImage in $APPDIR" >&2
  exit 1
fi
cp -f "$APPDIR"/*.AppImage dist-release/
echo "copied:"
ls -lh dist-release/

# The acceptance check (plan 12.9): the binary must not need a newer glibc
# than the AppImage ships. Extract the ELF and read its GLIBC symbol versions.
EXTRACT=/tmp/fastssh-jammy-extract
rm -rf "$EXTRACT"
BIN=$(find "$APPDIR" -maxdepth 3 -name fastssh -type f | head -1)
objdump -T "$BIN" | grep -o 'GLIBC_[0-9.]*' | sort -V | tail -1
