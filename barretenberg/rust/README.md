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

The FFI backend requires `libbarretenberg.a` from the cpp build (run `barretenberg/cpp/bootstrap.sh` first).
The library path is automatically configured via `build.rs`.

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

```bash
# Run all tests (FFI enabled by default, requires cpp build)
cargo test --release

# Run tests without FFI (pipe backend only)
cargo test --release --no-default-features --features native
```

## Generated Code

The API is auto-generated from the BB msgpack schema. To regenerate:

```bash
cd ../ts && yarn generate
```

## Features

- `native` (default): Enables `PipeBackend` and async runtime
- `ffi` (default): Enables `FfiBackend` for direct C FFI calls, auto-links to cpp/build/lib
- `async`: Enables async/await support
