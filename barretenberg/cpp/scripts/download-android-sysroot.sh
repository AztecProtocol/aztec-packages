#!/bin/bash
# Download Android NDK sysroot headers for cross-compilation from Linux using Zig.
# Uses the lightweight extracted sysroot from spacedriveapp/ndk-sysroot (~22MB).
# Usage: ./download-android-sysroot.sh
set -eu

SYSROOT_DIR="${ANDROID_SYSROOT_DIR:-$(dirname "$0")/../android-sysroot}"

echo "Checking for Android sysroot at $SYSROOT_DIR"

if [ -d "$SYSROOT_DIR/usr/include" ]; then
  echo "Android sysroot already present at $SYSROOT_DIR"
  exit 0
fi

echo "Downloading Android NDK sysroot..."
mkdir -p "$SYSROOT_DIR"
curl -fsSL https://github.com/spacedriveapp/ndk-sysroot/releases/download/2024.10.20/ndk_sysroot.tar.xz \
  | tar xJ -C "$SYSROOT_DIR"

if [ -d "$SYSROOT_DIR/usr/include" ]; then
  echo "Successfully downloaded Android sysroot"
else
  echo "ERROR: Failed to download Android sysroot."
  exit 1
fi
