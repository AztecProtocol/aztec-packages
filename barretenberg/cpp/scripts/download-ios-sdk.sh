#!/bin/bash
# Download iOS SDK for cross-compilation from Linux using Zig
# Usage: IOS_SDK_VERSION=26.2 ./download-ios-sdk.sh
set -eu

SDK_VERSION="${IOS_SDK_VERSION:-26.2}"
SDK_DIR="${IOS_SDK_DIR:-$(dirname "$0")/../ios-sdk}"
SDK_NAME="iPhoneOS${SDK_VERSION}.sdk"

echo "Checking for iOS SDK at $SDK_DIR/$SDK_NAME"

if [ -d "$SDK_DIR/$SDK_NAME" ]; then
  echo "iOS SDK already present at $SDK_DIR/$SDK_NAME"
  exit 0
fi

echo "Downloading iOS SDK $SDK_VERSION..."
mkdir -p "$SDK_DIR"
cd "$SDK_DIR"

# Sparse-clone only the specific SDK version to minimize download size
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/xybp888/iOS-SDKs.git .

git sparse-checkout set "$SDK_NAME"

if [ -d "$SDK_NAME" ]; then
  echo "Successfully downloaded $SDK_NAME"
else
  echo "ERROR: Failed to download $SDK_NAME. Check if version exists at https://github.com/xybp888/iOS-SDKs"
  exit 1
fi
