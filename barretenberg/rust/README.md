# barretenberg-rs

Rust bindings for the Barretenberg cryptographic library using msgpack protocol.

## Quick Start

### Using an IPC transport (no linking required)

Talk to a `bb msgpack run` process over ipc-runtime. `IpcClient` implements the
`Backend` trait, so this crate carries no transport code of its own: use
`from_fds` for a child's stdin/stdout pipe, or `from_path` for a `.sock` (UDS)
or `.shm` (shared memory) endpoint.

```rust
use barretenberg_rs::{ipc_runtime::IpcClient, BbApi};

let client = IpcClient::from_path("/tmp/bb.sock")?;
let mut api = BbApi::new(client);

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

// Same API as the IPC transports
let response = api.blake2s(b"hello world")?;
println!("Hash: {:?}", response.hash);
```

The FFI backend requires `libbarretenberg.a` from the cpp build (run `barretenberg/cpp/bootstrap.sh` first).
The library path is automatically configured via `build.rs`.

## Architecture

The crate provides a pluggable backend system:

- **ipc_runtime::IpcClient**: Talks to a `bb msgpack run` process over a pipe,
  UDS or shared memory; the transport lives in ipc-runtime, not here
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
│   IpcClient     │  │   FfiBackend    │
│  (bb process)   │  │ (libbarretenberg)│
└─────────────────┘  └─────────────────┘
```

## Testing

```bash
# Run all tests (FFI enabled by default, requires cpp build)
cargo test --release

# Run tests without FFI (pipe backend only)
cargo test --release --no-default-features --features ipc-runtime
```

## Generated Code

The API is auto-generated from the BB msgpack schema. To regenerate:

```bash
cd ../ts && yarn generate
```

## Features

- `ipc-runtime` (default): Enables the `ipc_runtime::IpcClient` transport backend
- `ffi` (default): Enables `FfiBackend` for direct C FFI calls, auto-links to cpp/build/lib
- `async`: Enables async/await support
