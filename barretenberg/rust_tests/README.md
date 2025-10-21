# Barretenberg Rust Tests

This directory contains Rust bindings and tests for the Barretenberg cryptographic library using the msgpack API protocol.

## Overview

This implementation provides:

- **Multiple Backend Support**: Shared memory, IPC (Unix sockets), and WASM backends
- **Msgpack Protocol**: Full support for the msgpack-based command/response protocol
- **Type-Safe API**: Strongly-typed Rust interfaces matching the TypeScript API
- **Comprehensive Tests**: Test suite paralleling `barretenberg/ts` tests

## Architecture

### Workspace Structure

```
rust_tests/
├── Cargo.toml                      # Workspace configuration
├── barretenberg-rs/                # Core library
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                  # Library entry point
│       ├── backend.rs              # Backend trait definitions
│       ├── types.rs                # Command/Response types
│       ├── api.rs                  # High-level API
│       ├── error.rs                # Error types
│       └── backends/               # Backend implementations
│           ├── unix_socket.rs      # Unix domain socket backend
│           ├── shared_memory.rs    # Shared memory backend (placeholder)
│           └── wasm.rs             # WASM backend (placeholder)
└── tests/                          # Test suite
    ├── Cargo.toml
    └── src/
        ├── lib.rs                  # Test library
        ├── utils.rs                # Test utilities
        ├── blake2s.rs              # Blake2s tests
        ├── pedersen.rs             # Pedersen hash/commit tests
        └── poseidon.rs             # Poseidon2 hash tests
```

### Backends

#### 1. Unix Socket Backend (Fully Implemented)

Communicates with the BB binary via Unix domain sockets using a 4-byte little-endian length prefix protocol.

**File**: `barretenberg-rs/src/backends/unix_socket.rs`

```rust
use barretenberg_rs::{backends::UnixSocketBackend, BarretenbergApiSync};

let backend = UnixSocketBackend::new("path/to/bb", "/tmp/bb.sock", Some(1))?;
let mut api = BarretenbergApiSync::new(backend);

let response = api.blake2s(data)?;
```

**Features:**
- Spawns BB process automatically with socket file
- Synchronous and asynchronous variants
- Proper cleanup on drop
- Timeout handling for connection
- Requires `.sock` file extension

**Usage:**
```rust
let backend = UnixSocketBackend::new("path/to/bb", "/tmp/bb.sock", Some(1))?;
```

#### 2. Pipe Backend (Fully Implemented)

Communicates with the BB binary via stdin/stdout pipes using a 4-byte little-endian length prefix protocol.

**File**: `barretenberg-rs/src/backends/pipe.rs`

**Features:**
- Spawns BB process with piped stdin/stdout
- Synchronous and asynchronous variants
- Direct process communication (no socket file)
- Automatic cleanup on drop
- Simpler setup than Unix sockets

**Usage:**
```rust
let backend = PipeBackend::new("path/to/bb", Some(1))?;
```

**When to use:**
- No socket file creation needed
- Simpler deployment (no file permissions issues)
- Single client communication
- Cross-platform pipe support

#### 3. Shared Memory Backend (Placeholder)

Designed to communicate via shared memory IPC. Requires FFI bindings to the C++ `MsgpackClient`.

**File**: `barretenberg-rs/src/backends/shared_memory.rs`

**Status:** Architecture defined, requires FFI implementation
**Use case:** High-performance synchronous operations with multiple concurrent clients

#### 4. WASM Backend (Placeholder)

Designed to interface with Barretenberg compiled to WASM.

**File**: `barretenberg-rs/src/backends/wasm.rs`

**Status:** Architecture defined, requires WASM module integration
**Use case:** Browser/WASM environments

### Backend Comparison

| Feature | Unix Socket | Pipe | Shared Memory | WASM |
|---------|-------------|------|---------------|------|
| Status | ✅ Complete | ✅ Complete | ⚠️ Placeholder | ⚠️ Placeholder |
| Transport | Socket file | stdin/stdout | Shared mem | WASM imports |
| Clients | Multiple | Single | Multiple | N/A |
| Async | ✅ | ✅ | ❌ | ✅ |
| Sync | ✅ | ✅ | ✅ | ❌ |
| File Required | Yes (.sock) | No | No | N/A |
| Performance | Good | Good | Best | N/A |
| Setup Complexity | Medium | Low | High | High |

## Usage

### Running Tests

```bash
# Build the workspace
cd barretenberg/rust_tests
cargo build

# Run all tests (requires BB binary)
export BB_BINARY_PATH=../cpp/build/bin/bb
cargo test

# Run specific test suite
cargo test --test blake2s
cargo test --test pedersen
cargo test --test poseidon

# Run performance tests (ignored by default)
cargo test --ignored -- --nocapture
```

### Using the Library

```rust
use barretenberg_rs::{
    backends::UnixSocketBackend,
    BarretenbergApiSync,
    Fr,
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create backend
    let backend = UnixSocketBackend::new(
        "/path/to/bb",
        "/tmp/bb_test.sock",
        Some(1),  // threads
    )?;

    // Create API
    let mut api = BarretenbergApiSync::new(backend);

    // Call functions
    let inputs = vec![
        Fr::from_u64(4).to_buffer(),
        Fr::from_u64(8).to_buffer(),
    ];
    let response = api.pedersen_hash(inputs, 7)?;

    println!("Hash: {:?}", hex::encode(&response.hash));

    // Cleanup
    api.destroy()?;

    Ok(())
}
```

### Async API

```rust
use barretenberg_rs::{backends::UnixSocketBackend, BarretenbergApi};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let backend = UnixSocketBackend::new("path/to/bb", "/tmp/bb.sock", Some(1))?;
    let mut api = BarretenbergApi::new(backend);

    let response = api.blake2s(data).await?;

    api.destroy().await?;
    Ok(())
}
```

## Available Operations

The following operations are supported (matching the TypeScript API):

- **Blake2s**: `blake2s`, `blake2s_to_field`
- **Pedersen**: `pedersen_hash`, `pedersen_hash_buffer`, `pedersen_commit`
- **Poseidon2**: `poseidon2_hash`

## Test Suite Parity

This test suite parallels the TypeScript tests in `barretenberg/ts/src/barretenberg/`:

| TypeScript Test | Rust Test | Status |
|----------------|-----------|--------|
| `blake2s.test.ts` | `tests/src/blake2s.rs` | ✅ Implemented |
| `pedersen.test.ts` | `tests/src/pedersen.rs` | ✅ Implemented |
| `poseidon.test.ts` | `tests/src/poseidon.rs` | ✅ Implemented |

Performance benchmarks are also included (run with `--ignored`).

## Msgpack Protocol

All backends use the msgpack serialization format with the following structure:

**Request:**
```
[Command]  // Array with single element
```

**Command:**
```
["CommandName", { command_data }]  // Variant name and payload
```

**Response:**
```
["ResponseType", { response_data }]  // Variant name and payload
```

**Native Backend Protocol:**
```
[4-byte length (LE)] + [msgpack payload]
```

## Features

The library supports conditional compilation via features:

- `default`: Enables `native` backend support
- `native`: Unix socket and shared memory backends
- `wasm`: WASM backend support
- `async`: Asynchronous API support

## Code Generation

### Automatic Type Generation from Schema

The Rust types can be automatically generated from the BB msgpack schema, just like the TypeScript bindings:

```bash
# Generate types from schema
cd ../ts
npm run generate
```

This generates:
- TypeScript bindings → `ts/src/cbind/generated/`
- **Rust bindings** → `rust_tests/barretenberg-rs/src/generated_types.rs`

See [README_CODEGEN.md](./README_CODEGEN.md) for detailed documentation.

### Current Status

- ✅ **Rust schema compiler** implemented in TypeScript
- ✅ **Command/Response enums** auto-generated
- ✅ **Type definitions** auto-generated with serde support
- ⚠️ **API methods** not yet generated (coming soon)
- ⚠️ **Build integration** manual for now

### How It Works

1. `bb msgpack schema` outputs JSON schema
2. TypeScript compiler (`rust_schema_compiler.ts`) processes schema
3. Generates Rust code with proper types and serde annotations
4. Output written to `generated_types.rs`

## Future Work

### Shared Memory Backend
- Implement FFI bindings to C++ `MsgpackClient`
- Create Rust wrapper around native shared memory operations
- Add build script for C++ compilation

### WASM Backend
- Load and initialize Barretenberg WASM module
- Implement memory management for WASM calls
- Support Web Workers for async operations

### Code Generation Enhancements
- ✅ ~~Create Rust code generator from msgpack schema~~ **DONE**
- ⚠️ Generate full API methods (like TypeScript SyncApi/AsyncApi)
- ⚠️ Integrate with cargo build via build.rs
- ⚠️ Add schema validation tests

## Contributing

When adding new operations:

1. Update `types.rs` with new Command/Response types
2. Add method to `BarretenbergApiSync` and `BarretenbergApi` in `api.rs`
3. Create corresponding tests
4. Ensure tests parallel TypeScript implementation

## License

See the root LICENSE file.
