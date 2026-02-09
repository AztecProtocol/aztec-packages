# iOS Cross-Compilation from Linux

This document explains how to cross-compile barretenberg for iOS from Linux.

## Problem

iOS SDKs use TBD (Text-Based Dylib) stub files instead of actual dylib files. These require special parsing support via **libtapi** (Text-based Application Programming Interface library). Standard toolchains like Zig don't include mature TAPI support, causing linking failures with iOS SDKs.

## Solution: cctools-port with TAPI

We use a complete iOS cross-compilation toolchain built from [cctools-port](https://github.com/tpoechtrager/cctools-port) which includes:

- **ldid** - Code signing tool for iOS binaries
- **apple-libdispatch** - Grand Central Dispatch library
- **apple-libtapi** - TBD file parser (the critical component)
- **cctools/ld64** - Apple's binary tools and linker with TAPI support

This toolchain properly parses iOS SDK TBD files and produces valid Mach-O ARM64 binaries.

## Building the Toolchain

### Prerequisites

```bash
sudo apt install build-essential autoconf automake cmake coreutils \
                 git libssl-dev libtool make pkg-config python3
```

### Build Script

Use the provided build script:

```bash
cd barretenberg/cpp/scripts
./build-ios-toolchain.sh
```

Build time: ~10-15 minutes
Toolchain location: `~/.ios-toolchain` (configurable via `IOS_TOOLCHAIN_DIR`)

### Manual Build

If you prefer to build manually, see [Building-An-Ios-Toolchain](https://github.com/L1ghtmann/Building-An-Ios-Toolchain) guide.

## Using the Toolchain

### Add to PATH

```bash
export PATH="$HOME/.ios-toolchain/bin:$PATH"
```

### Compiler Commands

```bash
# C compiler
arm-apple-darwin11-clang -target aarch64-ios -mios-version-min=16.3 ...

# C++ compiler
arm-apple-darwin11-clang++ -target aarch64-ios -mios-version-min=16.3 ...
```

### CMake Integration

The toolchain includes a wrapper script that automatically sets the SDK path and deployment target. Example CMake preset:

```json
{
  "name": "ios-arm64",
  "description": "iOS ARM64 cross-compilation using cctools-port",
  "binaryDir": "build-ios-arm64",
  "environment": {
    "PATH": "$HOME/.ios-toolchain/bin:$env{PATH}",
    "CC": "arm-apple-darwin11-clang",
    "CXX": "arm-apple-darwin11-clang++"
  },
  "cacheVariables": {
    "CMAKE_SYSTEM_NAME": "Darwin",
    "CMAKE_OSX_ARCHITECTURES": "arm64",
    "MOBILE": "ON"
  }
}
```

## CI Integration

### Option A: Build toolchain in CI

Add toolchain build step before iOS builds:

```yaml
- name: Build iOS toolchain
  run: |
    barretenberg/cpp/scripts/build-ios-toolchain.sh
    echo "$HOME/.ios-toolchain/bin" >> $GITHUB_PATH
```

**Pros**: Self-contained, no pre-built artifacts
**Cons**: Adds ~10-15 minutes to build time

### Option B: Pre-built toolchain cache

Build toolchain once and cache it:

```yaml
- name: Cache iOS toolchain
  uses: actions/cache@v4
  with:
    path: ~/.ios-toolchain
    key: ios-toolchain-v1-${{ runner.os }}
```

**Pros**: Fast builds after first run
**Cons**: Initial setup, cache management

## Technical Details

### Why Zig Doesn't Work

Zig 0.15.x and 0.16.0-dev both fail to parse iOS SDK TBD files:
- **Zig 0.15.x**: `error: failed to parse TBD file: NotLibStub`
- **Zig 0.16.0-dev**: Header search path issues with iOS SDK

Zig's bundled clang can target iOS, but lacks the TAPI infrastructure needed to parse TBD stub files.

### What libtapi Provides

libtapi (from Apple) provides:
- TBD file format parser (tapi-tbd-v3, tapi-tbd-v4)
- Text-based stub generation
- Integration with ld64 linker

Without libtapi, linkers cannot understand iOS SDK TBD files and fail during linking.

### Toolchain Components

Built from source:
1. **LLVM/Clang** (Apple fork) - Compiler targeting ARM64
2. **libplist** - Property list parsing (for ldid)
3. **ldid** - Binary signing and entitlements
4. **libtapi** - TBD parsing library
5. **cctools-port** - Apple's binary tools (ld, ar, nm, otool, etc.) ported to Linux

Total build time: ~10-15 minutes on modern hardware
Toolchain size: ~100-200 MB

## References

- [cctools-port](https://github.com/tpoechtrager/cctools-port) - Apple binary tools port
- [apple-libtapi](https://github.com/tpoechtrager/apple-libtapi) - TAPI library
- [Building-An-Ios-Toolchain](https://github.com/L1ghtmann/Building-An-Ios-Toolchain) - Comprehensive guide
- [iOS-SDKs](https://github.com/xybp888/iOS-SDKs) - Pre-packaged iOS SDKs
