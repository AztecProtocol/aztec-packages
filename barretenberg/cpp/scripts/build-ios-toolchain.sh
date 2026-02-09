#!/bin/bash
# Build iOS cross-compilation toolchain with TAPI support for Linux
# This toolchain includes libtapi which properly parses iOS SDK TBD files
set -euo pipefail

TOOLCHAIN_DIR="${IOS_TOOLCHAIN_DIR:-$HOME/.ios-toolchain}"
SDK_VERSION="${IOS_SDK_VERSION:-18.4}"
WORK_DIR="/tmp/ios-toolchain-build"

echo "Building iOS cross-compilation toolchain..."
echo "  Target directory: $TOOLCHAIN_DIR"
echo "  iOS SDK version: $SDK_VERSION"
echo ""

# Check if toolchain already exists
if [ -d "$TOOLCHAIN_DIR" ] && [ -f "$TOOLCHAIN_DIR/bin/arm-apple-darwin11-clang" ]; then
  echo "iOS toolchain already exists at $TOOLCHAIN_DIR"
  echo "To rebuild, remove the directory first: rm -rf $TOOLCHAIN_DIR"
  exit 0
fi

# Create work directory
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

# Download iOS SDK if not present
SDK_FILE="$WORK_DIR/iPhoneOS${SDK_VERSION}.sdk.tar.gz"
if [ ! -f "$SDK_FILE" ]; then
  echo "Downloading iOS SDK ${SDK_VERSION}..."
  mkdir -p ios-sdk-temp
  cd ios-sdk-temp
  git clone --depth 1 --filter=blob:none --sparse https://github.com/xybp888/iOS-SDKs.git .
  git sparse-checkout set "iPhoneOS${SDK_VERSION}.sdk"
  cd ..
  tar -czf "$SDK_FILE" -C ios-sdk-temp "iPhoneOS${SDK_VERSION}.sdk"
  rm -rf ios-sdk-temp
fi

# Clone cctools-port if not present
if [ ! -d "$WORK_DIR/cctools-port" ]; then
  echo "Cloning cctools-port..."
  git clone --depth 1 https://github.com/tpoechtrager/cctools-port.git
fi

# Build toolchain using the provided script
echo "Building toolchain components (ldid, libdispatch, libtapi, cctools)..."
echo "This may take 10-15 minutes..."
cd "$WORK_DIR/cctools-port/usage_examples/ios_toolchain"

# Run the build script
bash build.sh "$SDK_FILE" arm64

# Move toolchain to final location
echo "Installing toolchain to $TOOLCHAIN_DIR..."
mkdir -p "$(dirname "$TOOLCHAIN_DIR")"
mv target "$TOOLCHAIN_DIR"

echo ""
echo "✓ iOS toolchain build complete!"
echo ""
echo "The toolchain is installed at: $TOOLCHAIN_DIR"
echo "Add to PATH: export PATH=\"$TOOLCHAIN_DIR/bin:\$PATH\""
echo ""
echo "Toolchain includes:"
echo "  - arm-apple-darwin11-clang/clang++ (compiler)"
echo "  - arm-apple-darwin11-ld (linker with TAPI support)"
echo "  - arm-apple-darwin11-ar, ranlib, strip, nm, otool (binary tools)"
echo "  - ldid (code signing)"
echo ""
