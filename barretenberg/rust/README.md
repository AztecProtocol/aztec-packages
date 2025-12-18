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

Calls Barretenberg directly via FFI - maximum performance, requires linking:

```rust
use barretenberg_rs::{BarretenbergApi, backends::FfiBackend};

// Create FFI backend (requires libbarretenberg linked)
let backend = FfiBackend::new()?;
let mut api = BarretenbergApi::new(backend);

// Same API as PipeBackend
let response = api.blake2s(b"hello world")?;
println!("Hash: {:?}", response.hash);
```

To use FFI backend:
1. Build `libbarretenberg.a` for your target platform
2. Enable the `ffi` feature: `cargo build --features ffi`
3. Set `BARRETENBERG_LIB_DIR` to the directory containing `libbarretenberg.a`

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
# Run tests with PipeBackend (requires BB binary)
cargo test --release

# Run tests with FfiBackend (requires libbarretenberg)
BARRETENBERG_LIB_DIR=/path/to/lib cargo test --release --features ffi
```

## Generated Code

The API is auto-generated from the BB msgpack schema. To regenerate:

```bash
cd ../ts && yarn generate
```

## Features

- `native` (default): Enables `PipeBackend` and async runtime
- `ffi`: Enables `FfiBackend` for direct C FFI calls
- `async`: Enables async/await support
