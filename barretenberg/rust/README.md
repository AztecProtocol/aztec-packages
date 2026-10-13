# barretenberg-rs

Rust bindings for the Barretenberg cryptographic library using msgpack protocol.

## Quick Start

### Using PipeBackend (default)

Communicates with BB via stdin/stdout - no linking required:

```rust
use barretenberg_rs::{BarretenbergApi, backends::PipeBackend};

// Create a pipe backend (requires BB binary)
let backend = PipeBackend::new("/path/to/bb", Some(4))?;
let mut api = BarretenbergApi::new(backend);

// Hash some data
let response = api.blake2s(b"hello world")?;
println!("Hash: {:?}", response.hash);

// Cleanup
api.destroy()?;
```

### Using FfiBackend (for mobile/embedded)

Calls Barretenberg directly via FFI - maximum performance, enabled by default:

```rust
use barretenberg_rs::{BarretenbergApi, backends::FfiBackend};

// Create FFI backend (links to libbarretenberg automatically)
let backend = FfiBackend::new()?;
let mut api = BarretenbergApi::new(backend);

// Same API as PipeBackend
let response = api.blake2s(b"hello world")?;
println!("Hash: {:?}", response.hash);
```

The FFI backend links `libbb-external.a`. `build.rs` uses `BB_LIB_DIR` if it is set; otherwise it downloads `barretenberg-static-<arch>.tar.gz` from the GitHub release matching the crate version. The workspace version is `0.1.0`, for which `build.rs` panics unless `BB_LIB_DIR` (or `BARRETENBERG_VERSION`) is set. For a local build, run `barretenberg/cpp/bootstrap.sh` first, then set `BB_LIB_DIR=$(realpath ../cpp/build/lib)`.

## Architecture

The crate provides a pluggable backend system:

- **PipeBackend**: Spawns BB process, communicates via stdin/stdout pipes
- **FfiBackend**: Direct C FFI calls to libbarretenberg (no process overhead)
- **Custom Backend**: Implement the `Backend` trait for WASM, JSI, or other IPC

```
┌─────────────────────────────────────────┐
│          BarretenbergApi                │
│  (generated, type-safe Rust API)        │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│           Backend trait                 │
│  fn call(&mut self, &[u8]) -> Vec<u8>   │
└─────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│   PipeBackend   │  │   FfiBackend    │
│  (bb process)   │  │ (libbarretenberg)│
└─────────────────┘  └─────────────────┘
```

## Testing

The generated sources `barretenberg-rs/src/api.rs` and `generated_types.rs` are not in git. Run the generator (see "Generated Code") before the first `cargo build` or `cargo test`.

```bash
# Run tests without FFI (pipe backend only)
cargo test --release --no-default-features --features native

# Run FFI backend tests (requires libbb-external.a from the cpp build)
BB_LIB_DIR="$(cd ../cpp/build/lib && pwd)" RUSTFLAGS="-C link-arg=-Wl,--allow-multiple-definition" cargo test --release --features ffi
```

`./bootstrap.sh test` runs both.

## Generated Code

The API is auto-generated from the BB msgpack schema. To regenerate:

```bash
cd ../ts/bb.js && BB_BINARY_PATH=<bb> yarn generate
```

## Features

- `native` (default): Enables `PipeBackend` and async runtime
- `ffi` (default): Enables `FfiBackend` for direct C FFI calls; links `libbb-external.a` from `BB_LIB_DIR` or a downloaded release
- `async`: Enables async/await support
