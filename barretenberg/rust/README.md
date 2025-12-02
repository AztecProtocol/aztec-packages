# barretenberg-rs

Rust bindings for the Barretenberg cryptographic library using msgpack protocol.

## Quick Start

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

## Architecture

The crate provides a pluggable backend system:

- **PipeBackend**: Production backend communicating via stdin/stdout with the BB binary
- **MockBackend**: Testing backend with predefined responses
- **Custom Backend**: Implement the `Backend` trait for WASM, FFI, or other IPC

## Testing

```bash
# Run tests (requires BB binary)
cargo test --release

# Run with mock backend only (no BB binary needed)
cargo test --release mock
```

## Generated Code

The API is auto-generated from the BB msgpack schema. To regenerate:

```bash
cd ../ts && yarn generate
```

## Features

- `native` (default): Enables `PipeBackend` and async runtime
- `async`: Enables async/await support
