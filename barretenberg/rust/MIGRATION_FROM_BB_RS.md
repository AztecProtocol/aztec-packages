# Migration Guide: bb_rs → barretenberg-rs

This guide shows how to migrate from Obsidion's `bb_rs` fork to the official `barretenberg-rs` crate.

## Overview

| Aspect | bb_rs (fork) | barretenberg-rs (official) |
|--------|--------------|---------------------------|
| Build | Compiles C++ at cargo build time (~500 line build.rs) | Links to pre-built libs (~25 line build.rs) |
| Bindings | bindgen from C headers | Auto-generated from msgpack schema |
| API style | Direct function calls: `blake2s::blake2s()` | Object-oriented: `api.blake2s()` |
| Types | Manually defined | Auto-generated |

## Code Migration Examples

### Blake2s Hash

**Before (bb_rs):**
```rust
use bb_rs::barretenberg_api::blake2s;

let hash = blake2s::blake2s(b"hello world");
assert_eq!(hash.len(), 32);
```

**After (barretenberg-rs):**
```rust
use barretenberg_rs::{BarretenbergApi, backends::FfiBackend};

let backend = FfiBackend::new().unwrap();
let mut api = BarretenbergApi::new(backend);

let response = api.blake2s(b"hello world").unwrap();
assert_eq!(response.hash.len(), 32);
```

### Pedersen Hash

**Before (bb_rs):**
```rust
use bb_rs::barretenberg_api::pedersen;
use bb_rs::barretenberg_api::models::Fr;

let inputs = vec![Fr { data: [0u8; 32] }];
let result = pedersen::pedersen_hash(&inputs, 0);
```

**After (barretenberg-rs):**
```rust
use barretenberg_rs::{BarretenbergApi, backends::FfiBackend};

let backend = FfiBackend::new().unwrap();
let mut api = BarretenbergApi::new(backend);

let response = api.pedersen_hash(&[0u8; 32], 0).unwrap();
```

### Proving (UltraHonk)

**Before (bb_rs):**
```rust
use bb_rs::barretenberg_api::bbapi;

unsafe {
    let proof = bbapi::prove_ultra_honk(
        &constraint_system,
        &witness,
        &vkey,
    )?;
}
```

**After (barretenberg-rs):**
```rust
use barretenberg_rs::{BarretenbergApi, backends::FfiBackend};

let backend = FfiBackend::new().unwrap();
let mut api = BarretenbergApi::new(backend);

// All proving methods available through the generated API
let response = api.circuit_prove(circuit, witness, settings).unwrap();
```

## Build Configuration

### For Mobile (iOS/Android)

You still need to cross-compile `libbarretenberg.a` for your target platform. The key difference is that `barretenberg-rs` doesn't compile C++ at cargo build time - it expects the library to already exist.

**Option 1: Pre-build libraries**
```bash
# Build for iOS (from aztec-packages)
cd barretenberg/cpp
cmake --preset ios-arm64 -DMOBILE=ON -DAVM=OFF
cmake --build --preset ios-arm64

# The libs are now at build-ios-arm64/lib/
```

Then configure your project's `.cargo/config.toml`:
```toml
[target.aarch64-apple-ios]
rustflags = ["-L", "/path/to/build-ios-arm64/lib"]
```

**Option 2: Modify build.rs for cross-compilation**

You can extend `barretenberg-rs/build.rs` to handle cross-compilation:
```rust
#[cfg(feature = "ffi")]
{
    let lib_dir = if cfg!(target_os = "ios") {
        // Use iOS-specific build
        PathBuf::from(env!("IOS_LIB_DIR"))
    } else {
        // Default to cpp/build/lib
        PathBuf::from(&manifest_dir).join("../../cpp/build/lib")
    };
    // ... rest of linking
}
```

## What You Can Delete

After migrating to `barretenberg-rs`, you can remove from your fork:

- `barretenberg/bb_rs/` - The entire crate
- CMake mobile patches (if only used for bb_rs)
- bindgen workarounds

## What You Keep

- iOS/Android toolchain setup for cross-compiling the C++ library
- Any platform-specific build scripts for producing `libbarretenberg.a`

## Benefits

1. **No more manual type maintenance** - Types are auto-generated from msgpack schema
2. **Simpler build** - No cmake/bindgen at cargo build time
3. **Stay on upstream** - No need to maintain a fork of aztec-packages
4. **Same API for pipe/FFI** - Switch between process-based and direct FFI with one line change
